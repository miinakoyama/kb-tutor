-- Preserve the exact generated question identity/version used for an MCQ
-- attempt so delayed sync is scored and mapped against answer-time content.

ALTER TABLE public.generated_questions
  ADD COLUMN IF NOT EXISTS content_version uuid DEFAULT gen_random_uuid();

UPDATE public.generated_questions
SET content_version = gen_random_uuid()
WHERE content_version IS NULL;

ALTER TABLE public.generated_questions
  ALTER COLUMN content_version SET DEFAULT gen_random_uuid(),
  ALTER COLUMN content_version SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.generated_question_versions (
  question_set_id text NOT NULL
    REFERENCES public.generated_question_sets(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  content_version uuid NOT NULL,
  payload jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_set_id, question_id, content_version)
);

INSERT INTO public.generated_question_versions (
  question_set_id,
  question_id,
  content_version,
  payload,
  captured_at
)
SELECT
  question.set_id,
  question.id,
  question.content_version,
  question.payload,
  COALESCE(question.updated_at, question.created_at, now())
FROM public.generated_questions question
ON CONFLICT (question_set_id, question_id, content_version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.protect_generated_question_content_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.content_version := gen_random_uuid();
  ELSIF NEW.payload IS DISTINCT FROM OLD.payload THEN
    NEW.content_version := gen_random_uuid();
  ELSE
    NEW.content_version := OLD.content_version;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_generated_question_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.generated_question_versions (
    question_set_id,
    question_id,
    content_version,
    payload
  ) VALUES (
    NEW.set_id,
    NEW.id,
    NEW.content_version,
    NEW.payload
  )
  ON CONFLICT (question_set_id, question_id, content_version) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generated_questions_set_content_version_insert
  ON public.generated_questions;
CREATE TRIGGER generated_questions_set_content_version_insert
BEFORE INSERT ON public.generated_questions
FOR EACH ROW EXECUTE FUNCTION public.protect_generated_question_content_version();

DROP TRIGGER IF EXISTS generated_questions_set_content_version_update
  ON public.generated_questions;
CREATE TRIGGER generated_questions_set_content_version_update
BEFORE UPDATE OF payload, content_version ON public.generated_questions
FOR EACH ROW EXECUTE FUNCTION public.protect_generated_question_content_version();

DROP TRIGGER IF EXISTS generated_questions_capture_version_insert
  ON public.generated_questions;
CREATE TRIGGER generated_questions_capture_version_insert
AFTER INSERT ON public.generated_questions
FOR EACH ROW EXECUTE FUNCTION public.capture_generated_question_version();

DROP TRIGGER IF EXISTS generated_questions_capture_version_update
  ON public.generated_questions;
CREATE TRIGGER generated_questions_capture_version_update
AFTER UPDATE OF payload ON public.generated_questions
FOR EACH ROW
WHEN (OLD.payload IS DISTINCT FROM NEW.payload)
EXECUTE FUNCTION public.capture_generated_question_version();

ALTER TABLE public.generated_question_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.generated_question_versions
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.generated_question_versions TO service_role;

ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS question_set_id text,
  ADD COLUMN IF NOT EXISTS question_content_version uuid;

CREATE INDEX IF NOT EXISTS attempts_question_identity_idx
  ON public.attempts (question_set_id, question_id, answered_at DESC);

CREATE OR REPLACE FUNCTION public.apply_bkt_observation(
  p_source_kind text,
  p_source_attempt_id uuid,
  p_source_revision smallint DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_question_id text;
  v_question_set_id text;
  v_part_label text;
  v_mode text;
  v_correct boolean;
  v_answered_at timestamptz;
  v_format text;
  v_mapping public.question_kc_assignments;
  v_parameters public.bkt_parameter_sets;
  v_mastery public.student_kc_mastery;
  v_existing public.bkt_mastery_events;
  v_revision smallint := p_source_revision;
  v_prior double precision;
  v_posterior double precision;
  v_result double precision;
  v_event_id uuid;
  v_out_of_order boolean := false;
BEGIN
  IF p_source_kind = 'mcq_attempt' THEN
    SELECT
      attempt.user_id,
      attempt.question_id,
      attempt.question_set_id,
      NULL::text,
      attempt.mode,
      attempt.is_correct,
      attempt.answered_at
      INTO
        v_user_id,
        v_question_id,
        v_question_set_id,
        v_part_label,
        v_mode,
        v_correct,
        v_answered_at
    FROM public.attempts attempt
    WHERE attempt.id = p_source_attempt_id
      AND attempt.selected_option_id <> 'short-answer';
    v_format := 'mcq';
  ELSIF p_source_kind = 'saq_part_attempt' THEN
    SELECT
      attempt.user_id,
      attempt.question_id,
      attempt.question_set_id,
      attempt.part_label,
      attempt.mode,
      attempt.score = attempt.max_score,
      attempt.answered_at
      INTO
        v_user_id,
        v_question_id,
        v_question_set_id,
        v_part_label,
        v_mode,
        v_correct,
        v_answered_at
    FROM public.short_answer_attempts attempt
    WHERE attempt.id = p_source_attempt_id;
    v_format := 'saq';
  ELSE
    RAISE EXCEPTION 'Unsupported BKT source kind' USING ERRCODE = '23514';
  END IF;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT event.* INTO v_existing
  FROM public.bkt_mastery_events event
  WHERE event.source_kind = p_source_kind
    AND event.source_attempt_id = p_source_attempt_id
    AND event.event_type <> 'replay'
    AND event.superseded_at IS NULL
  ORDER BY event.source_revision DESC
  LIMIT 1;

  IF v_existing.mapping_id IS NOT NULL THEN
    SELECT assignment.* INTO v_mapping
    FROM public.question_kc_assignments assignment
    WHERE assignment.id = v_existing.mapping_id;
  ELSE
    SELECT assignment.* INTO v_mapping
    FROM public.question_kc_assignments assignment
    WHERE assignment.question_id = v_question_id
      AND assignment.part_label IS NOT DISTINCT FROM v_part_label
      AND assignment.format = v_format
      AND assignment.status IN ('confirmed', 'stale')
      AND assignment.valid_from <= v_answered_at
      AND (assignment.valid_to IS NULL OR v_answered_at < assignment.valid_to)
      AND (
        v_question_set_id IS NULL
        OR assignment.question_set_id = v_question_set_id
      )
    ORDER BY assignment.valid_from DESC
    LIMIT 1;
  END IF;

  IF v_mapping.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_existing.id IS NOT NULL
     AND v_existing.is_correct = v_correct
     AND v_existing.mapping_id = v_mapping.id THEN
    RETURN v_existing.id;
  END IF;

  SELECT parameter_set.* INTO v_parameters
  FROM public.bkt_parameter_sets parameter_set
  WHERE parameter_set.format = v_format AND parameter_set.active
  ORDER BY parameter_set.activated_at DESC
  LIMIT 1;

  IF v_parameters.id IS NULL THEN
    RAISE EXCEPTION 'No active BKT parameters for %', v_format;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    v_revision := GREATEST(v_revision, v_existing.source_revision + 1);
  END IF;

  INSERT INTO public.student_kc_mastery (
    user_id,
    kc_code,
    probability,
    mastered,
    last_parameter_set_id
  ) VALUES (
    v_user_id,
    v_mapping.kc_code,
    v_parameters.initial_mastery,
    false,
    v_parameters.id
  ) ON CONFLICT (user_id, kc_code) DO NOTHING;

  SELECT mastery.* INTO v_mastery
  FROM public.student_kc_mastery mastery
  WHERE mastery.user_id = v_user_id
    AND mastery.kc_code = v_mapping.kc_code
  FOR UPDATE;

  v_prior := v_mastery.probability;
  v_posterior := public.bkt_condition_probability(
    v_prior,
    v_correct,
    v_parameters.guess_rate,
    v_parameters.slip_rate
  );
  v_result := LEAST(1.0, GREATEST(0.0,
    v_posterior + (1 - v_posterior) * v_parameters.learning_rate
  ));
  v_out_of_order := v_mastery.latest_answered_at IS NOT NULL
    AND v_answered_at < v_mastery.latest_answered_at;

  v_event_id := gen_random_uuid();
  IF v_existing.id IS NOT NULL THEN
    UPDATE public.bkt_mastery_events
    SET superseded_at = now()
    WHERE id = v_existing.id;
  END IF;

  INSERT INTO public.bkt_mastery_events (
    id,
    user_id,
    kc_code,
    event_type,
    source_kind,
    source_attempt_id,
    source_revision,
    supersedes_event_id,
    mapping_id,
    parameter_set_id,
    question_id,
    part_label,
    question_format,
    mode,
    is_correct,
    prior_probability,
    posterior_probability,
    resulting_probability,
    answered_at
  ) VALUES (
    v_event_id,
    v_user_id,
    v_mapping.kc_code,
    CASE WHEN v_existing.id IS NULL THEN 'observation' ELSE 'correction' END,
    p_source_kind,
    p_source_attempt_id,
    v_revision,
    v_existing.id,
    v_mapping.id,
    v_parameters.id,
    v_question_id,
    v_part_label,
    v_format,
    v_mode,
    v_correct,
    v_prior,
    v_posterior,
    v_result,
    v_answered_at
  );

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.bkt_mastery_events
    SET superseded_by_event_id = v_event_id
    WHERE id = v_existing.id;
  END IF;

  IF v_out_of_order OR v_existing.id IS NOT NULL THEN
    PERFORM public.rebuild_student_kc_mastery(v_user_id, v_mapping.kc_code);
  ELSE
    UPDATE public.student_kc_mastery
    SET
      probability = v_result,
      mastered = v_result >= v_parameters.mastery_threshold,
      last_parameter_set_id = v_parameters.id,
      observation_count = observation_count + 1,
      latest_event_id = v_event_id,
      latest_answered_at = v_answered_at,
      lock_version = lock_version + 1,
      updated_at = now()
    WHERE user_id = v_user_id AND kc_code = v_mapping.kc_code;
  END IF;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_generated_question_content_version()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capture_generated_question_version()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_bkt_observation(text, uuid, smallint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_bkt_observation(text, uuid, smallint)
  TO service_role;
