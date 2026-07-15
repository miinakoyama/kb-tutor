-- Keep adaptive Practice candidate reads bounded by the target KC instead of
-- expanding every accessible question id into a PostgREST GET URL.  The
-- previous all-bank `.in(question_id, ...)` query exceeded the hosted gateway
-- request-line limit for schools with the full 24-standard bank.

ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS question_completed boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.attempts.question_completed IS
  'True when this attempt completes one presentation of the whole question. Practice retries before the final response are false; SAQ summary rows are true.';

-- Existing MCQ rows predate the explicit completion marker. Reconstruct the
-- normal two-attempt Practice/Review flow: a correct response completes the
-- presentation, while incorrect responses complete every second slot between
-- correct responses. Exam rows and SAQ summary rows already represent one
-- completed presentation each. Historical abandoned first attempts cannot be
-- distinguished from a later resumed second response because old rows have no
-- selection/run id; the pairing below is the closest deterministic recovery.
UPDATE public.attempts
SET question_completed = false
WHERE NOT is_finalized;

WITH ordered_mcq AS (
  SELECT
    attempt.id,
    attempt.user_id,
    attempt.question_set_id,
    attempt.question_id,
    attempt.assignment_id,
    attempt.answered_at,
    attempt.created_at,
    attempt.is_correct,
    COALESCE(
      sum(CASE WHEN attempt.is_correct THEN 1 ELSE 0 END) OVER (
        PARTITION BY
          attempt.user_id,
          attempt.question_set_id,
          attempt.question_id,
          attempt.assignment_id
        ORDER BY attempt.answered_at, attempt.created_at, attempt.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ) AS prior_correct_count
  FROM public.attempts attempt
  WHERE attempt.is_finalized
    AND attempt.mode IN ('practice', 'review')
    AND attempt.selected_option_id <> 'short-answer'
), numbered_incorrect AS (
  SELECT
    ordered.id,
    row_number() OVER (
      PARTITION BY
        ordered.user_id,
        ordered.question_set_id,
        ordered.question_id,
        ordered.assignment_id,
        ordered.prior_correct_count
      ORDER BY ordered.answered_at, ordered.created_at, ordered.id
    ) AS incorrect_position
  FROM ordered_mcq ordered
  WHERE NOT ordered.is_correct
)
UPDATE public.attempts attempt
SET question_completed = false
FROM numbered_incorrect numbered
WHERE attempt.id = numbered.id
  AND numbered.incorrect_position % 2 = 1;

CREATE INDEX IF NOT EXISTS attempts_adaptive_completion_idx
  ON public.attempts (user_id, question_set_id, question_id, answered_at DESC)
  WHERE is_finalized AND question_completed;

CREATE OR REPLACE FUNCTION public.get_adaptive_practice_candidates(
  p_user_id uuid,
  p_standard_id text,
  p_target_kc_code text
)
RETURNS TABLE (
  question_set_id text,
  question_id text,
  payload jsonb,
  content_version uuid,
  has_image boolean,
  has_stimulus_image boolean,
  format text,
  standard_id text,
  part_kc_codes text[],
  completed_count bigint,
  last_completed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH accessible_target_questions AS (
    SELECT DISTINCT
      question.set_id AS question_set_id,
      question.id AS question_id,
      question.payload_lean AS payload,
      question.content_version,
      question.has_image,
      question.has_stimulus_image,
      question.created_at
    FROM public.school_members member
    JOIN public.school_question_sets school_set
      ON school_set.school_id = member.school_id
    JOIN public.bkt_standard_rollouts rollout
      ON rollout.school_id = member.school_id
     AND rollout.standard_id = p_standard_id
     AND rollout.status = 'enabled'
    JOIN public.generated_questions question
      ON question.set_id = school_set.set_id
     AND question.include_in_self_practice
    JOIN public.question_kc_assignments target_mapping
      ON target_mapping.question_set_id = question.set_id
     AND target_mapping.question_id = question.id
     AND target_mapping.standard_id = p_standard_id
     AND target_mapping.kc_code = p_target_kc_code
     AND target_mapping.status = 'confirmed'
     AND target_mapping.valid_to IS NULL
    JOIN public.knowledge_components target_kc
      ON target_kc.code = target_mapping.kc_code
     AND target_kc.standard_id = p_standard_id
     AND target_kc.active
    WHERE member.student_user_id = p_user_id
  ), candidates AS (
    SELECT
      target.question_set_id,
      target.question_id,
      target.payload,
      target.content_version,
      target.has_image,
      target.has_stimulus_image,
      min(mapping.format) AS format,
      min(mapping.standard_id) AS standard_id,
      array_agg(DISTINCT mapping.kc_code ORDER BY mapping.kc_code) AS part_kc_codes,
      target.created_at
    FROM accessible_target_questions target
    JOIN public.question_kc_assignments mapping
      ON mapping.question_set_id = target.question_set_id
     AND mapping.question_id = target.question_id
     AND mapping.standard_id = p_standard_id
     AND mapping.status = 'confirmed'
     AND mapping.valid_to IS NULL
    GROUP BY
      target.question_set_id,
      target.question_id,
      target.payload,
      target.content_version,
      target.has_image,
      target.has_stimulus_image,
      target.created_at
  )
  SELECT
    candidate.question_set_id,
    candidate.question_id,
    candidate.payload,
    candidate.content_version,
    candidate.has_image,
    candidate.has_stimulus_image,
    candidate.format,
    candidate.standard_id,
    candidate.part_kc_codes,
    COALESCE(scoped_history.completed_count, 0)
      + COALESCE(legacy_history.completed_count, 0) AS completed_count,
    CASE
      WHEN scoped_history.last_completed_at IS NULL THEN legacy_history.last_completed_at
      WHEN legacy_history.last_completed_at IS NULL THEN scoped_history.last_completed_at
      ELSE GREATEST(scoped_history.last_completed_at, legacy_history.last_completed_at)
    END AS last_completed_at
  FROM candidates candidate
  LEFT JOIN LATERAL (
    SELECT
      count(*) AS completed_count,
      max(attempt.answered_at) AS last_completed_at
    FROM public.attempts attempt
    WHERE attempt.user_id = p_user_id
      AND attempt.question_set_id = candidate.question_set_id
      AND attempt.question_id = candidate.question_id
      AND attempt.is_finalized
      AND attempt.question_completed
  ) scoped_history ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) AS completed_count,
      max(attempt.answered_at) AS last_completed_at
    FROM public.attempts attempt
    WHERE attempt.user_id = p_user_id
      AND attempt.question_set_id IS NULL
      AND attempt.question_id = candidate.question_id
      AND attempt.is_finalized
      AND attempt.question_completed
  ) legacy_history ON true
  ORDER BY candidate.created_at, candidate.question_id;
$$;

REVOKE ALL ON FUNCTION public.get_adaptive_practice_candidates(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_adaptive_practice_candidates(uuid, text, text)
  TO service_role;
