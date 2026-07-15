-- Versioned BKT parameters, append-only evidence, and atomic current mastery.

CREATE TABLE IF NOT EXISTS public.bkt_parameter_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  format text NOT NULL CHECK (format IN ('mcq', 'saq')),
  initial_mastery double precision NOT NULL CHECK (initial_mastery BETWEEN 0 AND 1),
  learning_rate double precision NOT NULL CHECK (learning_rate BETWEEN 0 AND 1),
  guess_rate double precision NOT NULL CHECK (guess_rate BETWEEN 0 AND 1),
  slip_rate double precision NOT NULL CHECK (slip_rate BETWEEN 0 AND 1),
  forgetting_rate double precision NOT NULL DEFAULT 0 CHECK (forgetting_rate = 0),
  mastery_threshold double precision NOT NULL CHECK (mastery_threshold BETWEEN 0 AND 1),
  active boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version, format)
);

CREATE UNIQUE INDEX IF NOT EXISTS bkt_parameter_sets_one_active_format_uidx
  ON public.bkt_parameter_sets (format) WHERE active;

INSERT INTO public.bkt_parameter_sets (
  version, format, initial_mastery, learning_rate, guess_rate, slip_rate,
  forgetting_rate, mastery_threshold, active, activated_at
) VALUES
  ('bkt-v1-no-forgetting', 'mcq', 0.30, 0.10, 0.25, 0.10, 0, 0.95, true, now()),
  ('bkt-v1-no-forgetting', 'saq', 0.30, 0.10, 0.10, 0.10, 0, 0.95, true, now())
ON CONFLICT (version, format) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.student_kc_mastery (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kc_code text NOT NULL REFERENCES public.knowledge_components(code),
  probability double precision NOT NULL CHECK (probability BETWEEN 0 AND 1),
  mastered boolean NOT NULL DEFAULT false,
  last_parameter_set_id uuid NOT NULL REFERENCES public.bkt_parameter_sets(id),
  observation_count integer NOT NULL DEFAULT 0 CHECK (observation_count >= 0),
  latest_event_id uuid,
  latest_answered_at timestamptz,
  lock_version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kc_code)
);

CREATE TABLE IF NOT EXISTS public.bkt_mastery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kc_code text NOT NULL REFERENCES public.knowledge_components(code),
  event_type text NOT NULL CHECK (event_type IN ('observation', 'correction', 'replay')),
  source_kind text CHECK (source_kind IN ('mcq_attempt', 'saq_part_attempt')),
  source_attempt_id uuid,
  source_revision smallint NOT NULL DEFAULT 1 CHECK (source_revision > 0),
  supersedes_event_id uuid REFERENCES public.bkt_mastery_events(id),
  superseded_by_event_id uuid REFERENCES public.bkt_mastery_events(id),
  superseded_at timestamptz,
  mapping_id uuid REFERENCES public.question_kc_assignments(id),
  parameter_set_id uuid NOT NULL REFERENCES public.bkt_parameter_sets(id),
  question_id text,
  part_label text CHECK (part_label IS NULL OR part_label IN ('A', 'B', 'C')),
  question_format text NOT NULL CHECK (question_format IN ('mcq', 'saq')),
  mode text CHECK (mode IS NULL OR mode IN ('practice', 'exam', 'review')),
  is_correct boolean,
  prior_probability double precision NOT NULL CHECK (prior_probability BETWEEN 0 AND 1),
  posterior_probability double precision NOT NULL CHECK (posterior_probability BETWEEN 0 AND 1),
  resulting_probability double precision NOT NULL CHECK (resulting_probability BETWEEN 0 AND 1),
  answered_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (event_type = 'replay' AND source_kind IS NULL AND source_attempt_id IS NULL AND is_correct IS NULL)
    OR
    (event_type <> 'replay' AND source_kind IS NOT NULL AND source_attempt_id IS NOT NULL
      AND mapping_id IS NOT NULL AND question_id IS NOT NULL AND mode IS NOT NULL AND is_correct IS NOT NULL)
  ),
  UNIQUE (source_kind, source_attempt_id, source_revision)
);

ALTER TABLE public.student_kc_mastery
  ADD CONSTRAINT student_kc_mastery_latest_event_fkey
  FOREIGN KEY (latest_event_id) REFERENCES public.bkt_mastery_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS student_kc_mastery_selection_idx
  ON public.student_kc_mastery (user_id, mastered, probability DESC);
CREATE INDEX IF NOT EXISTS bkt_mastery_events_replay_idx
  ON public.bkt_mastery_events (user_id, kc_code, answered_at, created_at, id)
  WHERE event_type <> 'replay' AND superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS bkt_mastery_events_question_idx
  ON public.bkt_mastery_events (question_id, part_label, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bkt_mastery_events_active_source_uidx
  ON public.bkt_mastery_events (source_kind, source_attempt_id)
  WHERE source_attempt_id IS NOT NULL AND superseded_at IS NULL AND event_type <> 'replay';

CREATE OR REPLACE FUNCTION public.bkt_condition_probability(
  p_prior double precision, p_correct boolean, p_guess double precision, p_slip double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT LEAST(1.0, GREATEST(0.0,
    CASE WHEN p_correct THEN
      CASE WHEN p_prior * (1 - p_slip) + (1 - p_prior) * p_guess = 0 THEN p_prior
      ELSE p_prior * (1 - p_slip) / (p_prior * (1 - p_slip) + (1 - p_prior) * p_guess) END
    ELSE
      CASE WHEN p_prior * p_slip + (1 - p_prior) * (1 - p_guess) = 0 THEN p_prior
      ELSE p_prior * p_slip / (p_prior * p_slip + (1 - p_prior) * (1 - p_guess)) END
    END
  ));
$$;

CREATE OR REPLACE FUNCTION public.rebuild_student_kc_mastery(p_user_id uuid, p_kc_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event record;
  v_probability double precision;
  v_posterior double precision;
  v_count integer := 0;
  v_last_parameter uuid;
  v_last_answered timestamptz;
  v_threshold double precision := 0.95;
  v_replay_id uuid;
BEGIN
  SELECT ps.initial_mastery INTO v_probability
  FROM public.bkt_parameter_sets ps
  JOIN public.bkt_mastery_events e ON e.parameter_set_id = ps.id
  WHERE e.user_id = p_user_id AND e.kc_code = p_kc_code
    AND e.event_type <> 'replay' AND e.superseded_at IS NULL
  ORDER BY e.answered_at, e.created_at, e.id LIMIT 1;
  IF v_probability IS NULL THEN RETURN NULL; END IF;

  FOR v_event IN
    SELECT e.*, ps.learning_rate, ps.guess_rate, ps.slip_rate, ps.mastery_threshold
    FROM public.bkt_mastery_events e
    JOIN public.bkt_parameter_sets ps ON ps.id = e.parameter_set_id
    WHERE e.user_id = p_user_id AND e.kc_code = p_kc_code
      AND e.event_type <> 'replay' AND e.superseded_at IS NULL
    ORDER BY e.answered_at, e.created_at, e.id
  LOOP
    v_posterior := public.bkt_condition_probability(
      v_probability, v_event.is_correct, v_event.guess_rate, v_event.slip_rate
    );
    v_probability := LEAST(1.0, GREATEST(0.0,
      v_posterior + (1 - v_posterior) * v_event.learning_rate
    ));
    v_count := v_count + 1;
    v_last_parameter := v_event.parameter_set_id;
    v_last_answered := v_event.answered_at;
    v_threshold := v_event.mastery_threshold;
  END LOOP;

  INSERT INTO public.bkt_mastery_events (
    user_id, kc_code, event_type, parameter_set_id, question_format,
    prior_probability, posterior_probability, resulting_probability, answered_at
  ) VALUES (
    p_user_id, p_kc_code, 'replay', v_last_parameter,
    (SELECT format FROM public.bkt_parameter_sets WHERE id = v_last_parameter),
    v_probability, v_probability, v_probability, COALESCE(v_last_answered, now())
  ) RETURNING id INTO v_replay_id;

  INSERT INTO public.student_kc_mastery (
    user_id, kc_code, probability, mastered, last_parameter_set_id,
    observation_count, latest_event_id, latest_answered_at, lock_version
  ) VALUES (
    p_user_id, p_kc_code, v_probability, v_probability >= v_threshold, v_last_parameter,
    v_count, v_replay_id, v_last_answered, 1
  ) ON CONFLICT (user_id, kc_code) DO UPDATE SET
    probability = EXCLUDED.probability, mastered = EXCLUDED.mastered,
    last_parameter_set_id = EXCLUDED.last_parameter_set_id,
    observation_count = EXCLUDED.observation_count,
    latest_event_id = EXCLUDED.latest_event_id,
    latest_answered_at = EXCLUDED.latest_answered_at,
    lock_version = public.student_kc_mastery.lock_version + 1,
    updated_at = now();
  RETURN v_replay_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_bkt_observation(
  p_source_kind text, p_source_attempt_id uuid, p_source_revision smallint DEFAULT 1
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
    SELECT a.user_id, a.question_id, NULL::text, NULL::text, a.mode, a.is_correct, a.answered_at
      INTO v_user_id, v_question_id, v_question_set_id, v_part_label, v_mode, v_correct, v_answered_at
    FROM public.attempts a WHERE a.id = p_source_attempt_id AND a.selected_option_id <> 'short-answer';
    v_format := 'mcq';
  ELSIF p_source_kind = 'saq_part_attempt' THEN
    SELECT a.user_id, a.question_id, a.question_set_id, a.part_label, a.mode,
      (a.score = a.max_score), a.answered_at
      INTO v_user_id, v_question_id, v_question_set_id, v_part_label, v_mode, v_correct, v_answered_at
    FROM public.short_answer_attempts a WHERE a.id = p_source_attempt_id;
    v_format := 'saq';
  ELSE
    RAISE EXCEPTION 'Unsupported BKT source kind' USING ERRCODE = '23514';
  END IF;
  IF v_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT assignment.* INTO v_mapping
  FROM public.question_kc_assignments assignment
  WHERE assignment.question_id = v_question_id
    AND assignment.part_label IS NOT DISTINCT FROM v_part_label
    AND assignment.format = v_format
    AND assignment.valid_to IS NULL AND assignment.status = 'confirmed'
    AND (v_question_set_id IS NULL OR assignment.question_set_id = v_question_set_id)
  ORDER BY assignment.valid_from DESC LIMIT 1;
  IF v_mapping.id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_parameters FROM public.bkt_parameter_sets
  WHERE format = v_format AND active ORDER BY activated_at DESC LIMIT 1;
  IF v_parameters.id IS NULL THEN RAISE EXCEPTION 'No active BKT parameters for %', v_format; END IF;

  SELECT * INTO v_existing FROM public.bkt_mastery_events
  WHERE source_kind = p_source_kind AND source_attempt_id = p_source_attempt_id
    AND event_type <> 'replay' AND superseded_at IS NULL
  ORDER BY source_revision DESC LIMIT 1;
  IF v_existing.id IS NOT NULL AND v_existing.is_correct = v_correct
     AND v_existing.mapping_id = v_mapping.id THEN
    RETURN v_existing.id;
  END IF;
  IF v_existing.id IS NOT NULL THEN
    v_revision := GREATEST(v_revision, v_existing.source_revision + 1);
  END IF;

  INSERT INTO public.student_kc_mastery (
    user_id, kc_code, probability, mastered, last_parameter_set_id
  ) VALUES (
    v_user_id, v_mapping.kc_code, v_parameters.initial_mastery, false, v_parameters.id
  ) ON CONFLICT (user_id, kc_code) DO NOTHING;
  SELECT * INTO v_mastery FROM public.student_kc_mastery
  WHERE user_id = v_user_id AND kc_code = v_mapping.kc_code FOR UPDATE;

  v_prior := v_mastery.probability;
  v_posterior := public.bkt_condition_probability(
    v_prior, v_correct, v_parameters.guess_rate, v_parameters.slip_rate
  );
  v_result := LEAST(1.0, GREATEST(0.0,
    v_posterior + (1 - v_posterior) * v_parameters.learning_rate
  ));
  v_out_of_order := v_mastery.latest_answered_at IS NOT NULL
    AND v_answered_at < v_mastery.latest_answered_at;

  v_event_id := gen_random_uuid();
  IF v_existing.id IS NOT NULL THEN
    UPDATE public.bkt_mastery_events SET superseded_at = now()
    WHERE id = v_existing.id;
  END IF;

  INSERT INTO public.bkt_mastery_events (
    id, user_id, kc_code, event_type, source_kind, source_attempt_id, source_revision,
    supersedes_event_id, mapping_id, parameter_set_id, question_id, part_label,
    question_format, mode, is_correct, prior_probability, posterior_probability,
    resulting_probability, answered_at
  ) VALUES (
    v_event_id, v_user_id, v_mapping.kc_code,
    CASE WHEN v_existing.id IS NULL THEN 'observation' ELSE 'correction' END,
    p_source_kind, p_source_attempt_id, v_revision, v_existing.id,
    v_mapping.id, v_parameters.id, v_question_id, v_part_label,
    v_format, v_mode, v_correct, v_prior, v_posterior, v_result, v_answered_at
  );

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.bkt_mastery_events SET superseded_by_event_id = v_event_id
    WHERE id = v_existing.id;
  END IF;

  IF v_out_of_order OR v_existing.id IS NOT NULL THEN
    PERFORM public.rebuild_student_kc_mastery(v_user_id, v_mapping.kc_code);
  ELSE
    UPDATE public.student_kc_mastery SET
      probability = v_result, mastered = v_result >= v_parameters.mastery_threshold,
      last_parameter_set_id = v_parameters.id,
      observation_count = observation_count + 1,
      latest_event_id = v_event_id, latest_answered_at = v_answered_at,
      lock_version = lock_version + 1, updated_at = now()
    WHERE user_id = v_user_id AND kc_code = v_mapping.kc_code;
  END IF;
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.bkt_attempt_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.selected_option_id <> 'short-answer' THEN
    PERFORM public.apply_bkt_observation('mcq_attempt', NEW.id, 1::smallint);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.bkt_saq_attempt_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.apply_bkt_observation('saq_part_attempt', NEW.id, 1::smallint);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attempts_apply_bkt ON public.attempts;
CREATE TRIGGER attempts_apply_bkt
AFTER INSERT OR UPDATE OF is_correct, answered_at ON public.attempts
FOR EACH ROW EXECUTE FUNCTION public.bkt_attempt_trigger();

DROP TRIGGER IF EXISTS short_answer_attempts_apply_bkt ON public.short_answer_attempts;
CREATE TRIGGER short_answer_attempts_apply_bkt
AFTER INSERT OR UPDATE OF score, max_score, answered_at ON public.short_answer_attempts
FOR EACH ROW EXECUTE FUNCTION public.bkt_saq_attempt_trigger();

ALTER TABLE public.bkt_parameter_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_kc_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bkt_mastery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY bkt_parameter_sets_read ON public.bkt_parameter_sets FOR SELECT TO authenticated USING (true);
CREATE POLICY student_kc_mastery_scoped_read ON public.student_kc_mastery FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR (public.is_teacher() AND public.teacher_can_read_student_profile(user_id)));
CREATE POLICY bkt_mastery_events_scoped_read ON public.bkt_mastery_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR (public.is_teacher() AND public.teacher_can_read_student_profile(user_id)));

REVOKE ALL ON public.bkt_parameter_sets, public.student_kc_mastery, public.bkt_mastery_events FROM anon, authenticated;
GRANT SELECT ON public.bkt_parameter_sets, public.student_kc_mastery, public.bkt_mastery_events TO authenticated;
GRANT ALL ON public.bkt_parameter_sets, public.student_kc_mastery, public.bkt_mastery_events TO service_role;
REVOKE ALL ON FUNCTION public.bkt_condition_probability(double precision, boolean, double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rebuild_student_kc_mastery(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_bkt_observation(text, uuid, smallint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bkt_attempt_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bkt_saq_attempt_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bkt_condition_probability(double precision, boolean, double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.rebuild_student_kc_mastery(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_bkt_observation(text, uuid, smallint) TO service_role;
