-- Self Practice question loading pushed into a single SECURITY DEFINER RPC.
--
-- Students loading Self Practice / Exam Mode previously ran a PostgREST select
-- on generated_questions guarded by three OR'ed RLS policies. The student
-- policy evaluates an EXISTS against school_question_sets per candidate row,
-- and school_question_sets has its own RLS calling further helper functions
-- (is_admin -> current_role -> profiles, plus three EXISTS probes). That
-- nested per-row evaluation scales with question count and exceeds the
-- authenticated role's statement timeout on production data (error 57014).
--
-- get_self_practice_questions() resolves the caller's accessible sets once
-- (the CTE scans school_question_sets, which stays small), then returns SP
-- questions with a plain join. SECURITY DEFINER bypasses per-row RLS; access
-- rules replicate can_access_school_question_set_row():
--   admin | school owner teacher | school_teachers member | school_members student.
-- Set metadata is joined in so the client needs no follow-up query.

CREATE OR REPLACE FUNCTION public.get_self_practice_questions()
RETURNS TABLE (
  id text,
  set_id text,
  payload jsonb,
  content_version uuid,
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
    gq.payload,
    gq.content_version,
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

-- Supports the per-set SP lookup and the (created_at, id) ordering without a
-- full-table sort; partial so rows excluded from Self Practice cost nothing.
CREATE INDEX IF NOT EXISTS idx_generated_questions_sp_order
  ON public.generated_questions (set_id, created_at, id)
  WHERE include_in_self_practice;
