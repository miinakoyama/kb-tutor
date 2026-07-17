-- Split heavy media out of the Self Practice list payload.
--
-- get_self_practice_questions() fixed the per-row RLS cost, but the statement
-- still serialized every question's full payload. Payloads embed base64 PNGs
-- (payload.imageUrl and payload.shortAnswer.stimulus.imageB64), averaging
-- ~230 kB per question; production's SP bank is 760 questions / 117 MB, so a
-- single json_agg over it cannot finish inside the authenticated role's 8s
-- statement timeout (error 57014).
--
-- Fix: precompute an image-free copy of the payload as stored generated
-- columns (computed once per write, so the list query never detoasts the
-- originals), serve that from the list RPC together with has-media flags, and
-- add a per-question media RPC the client calls lazily when a question is
-- displayed.
--
-- NOTE: adding stored generated columns rewrites generated_questions (table
-- includes all payload TOAST data). Run at a low-traffic time.

ALTER TABLE public.generated_questions
  ADD COLUMN IF NOT EXISTS payload_lean jsonb
    GENERATED ALWAYS AS ((payload - 'imageUrl') #- '{shortAnswer,stimulus,imageB64}') STORED,
  ADD COLUMN IF NOT EXISTS has_image boolean
    GENERATED ALWAYS AS (NULLIF(payload ->> 'imageUrl', '') IS NOT NULL) STORED,
  ADD COLUMN IF NOT EXISTS has_stimulus_image boolean
    GENERATED ALWAYS AS (NULLIF(payload #>> '{shortAnswer,stimulus,imageB64}', '') IS NOT NULL) STORED;

COMMENT ON COLUMN public.generated_questions.payload_lean IS
  'payload with embedded base64 images (imageUrl, shortAnswer.stimulus.imageB64) removed; served to Self Practice lists. Media is fetched per question via get_self_practice_question_media().';

-- Shared access check: the set is linked to a school the caller belongs to
-- (admin | school owner teacher | school_teachers member | school_members
-- student) — same rules as can_access_school_question_set_row().
CREATE OR REPLACE FUNCTION public.can_access_school_linked_set(p_set_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_question_sets sqs
    WHERE sqs.set_id = p_set_id
      AND (
        public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.schools s
          WHERE s.id = sqs.school_id AND s.teacher_user_id = (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.school_teachers st
          WHERE st.school_id = sqs.school_id AND st.teacher_user_id = (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.school_members sm
          WHERE sm.school_id = sqs.school_id AND sm.student_user_id = (SELECT auth.uid())
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_school_linked_set(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_school_linked_set(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_school_linked_set(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_school_linked_set(text) TO service_role;

-- Return type changes (has_image / has_stimulus_image), so the old function
-- must be dropped rather than replaced.
DROP FUNCTION IF EXISTS public.get_self_practice_questions();

CREATE FUNCTION public.get_self_practice_questions()
RETURNS TABLE (
  id text,
  set_id text,
  payload jsonb,
  content_version uuid,
  has_image boolean,
  has_stimulus_image boolean,
  set_name text,
  set_generated_at timestamptz,
  generation_model_id text,
  generation_model_label text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH accessible_sets AS (
    SELECT DISTINCT sqs.set_id
    FROM public.school_question_sets sqs
    WHERE public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.schools s
        WHERE s.id = sqs.school_id AND s.teacher_user_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.school_teachers st
        WHERE st.school_id = sqs.school_id AND st.teacher_user_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.school_members sm
        WHERE sm.school_id = sqs.school_id AND sm.student_user_id = (SELECT auth.uid())
      )
  )
  SELECT
    gq.id,
    gq.set_id,
    gq.payload_lean,
    gq.content_version,
    gq.has_image,
    gq.has_stimulus_image,
    gqs.name,
    gqs.generated_at,
    gqs.generation_model_id,
    gqs.generation_model_label
  FROM public.generated_questions gq
  JOIN accessible_sets a ON a.set_id = gq.set_id
  JOIN public.generated_question_sets gqs ON gqs.id = gq.set_id
  WHERE gq.include_in_self_practice
  ORDER BY gq.created_at ASC, gq.id ASC;
$$;

REVOKE ALL ON FUNCTION public.get_self_practice_questions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_self_practice_questions() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_self_practice_questions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_self_practice_questions() TO service_role;

-- Per-question media lookup: a single-row primary-key read, called lazily by
-- the client when a question with stripped media is displayed.
CREATE OR REPLACE FUNCTION public.get_self_practice_question_media(
  p_set_id text,
  p_question_id text
)
RETURNS TABLE (
  image_url text,
  stimulus_image_b64 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NULLIF(gq.payload ->> 'imageUrl', ''),
    NULLIF(gq.payload #>> '{shortAnswer,stimulus,imageB64}', '')
  FROM public.generated_questions gq
  WHERE gq.set_id = p_set_id
    AND gq.id = p_question_id
    AND gq.include_in_self_practice
    AND public.can_access_school_linked_set(p_set_id);
$$;

REVOKE ALL ON FUNCTION public.get_self_practice_question_media(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_self_practice_question_media(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_self_practice_question_media(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_self_practice_question_media(text, text) TO service_role;
