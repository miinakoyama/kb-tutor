CREATE OR REPLACE FUNCTION public.assignment_manage_counts(p_assignment_ids text[])
RETURNS TABLE (
  assignment_id text,
  attempt_count integer,
  respondent_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped_assignments AS (
    SELECT id, school_id
    FROM public.assignments
    WHERE id = ANY (p_assignment_ids)
  ),
  eligible_students AS (
    SELECT sa.id AS assignment_id, sm.student_user_id AS user_id
    FROM scoped_assignments sa
    JOIN public.school_members sm
      ON sm.school_id = sa.school_id

    UNION

    SELECT at.assignment_id, at.student_user_id AS user_id
    FROM public.assignment_targets at
    WHERE at.assignment_id = ANY (p_assignment_ids)
  ),
  analytics_eligible_students AS (
    SELECT DISTINCT es.assignment_id, es.user_id
    FROM eligible_students es
    LEFT JOIN public.profiles p
      ON p.id = es.user_id
    WHERE COALESCE(p.excluded_from_analytics, false) = false
  ),
  target_completion AS (
    SELECT at.assignment_id, at.student_user_id AS user_id, at.last_completed_at
    FROM public.assignment_targets at
    JOIN analytics_eligible_students es
      ON es.assignment_id = at.assignment_id
     AND es.user_id = at.student_user_id
    WHERE at.assignment_id = ANY (p_assignment_ids)
  ),
  scoped_attempts AS (
    SELECT a.assignment_id, a.user_id, a.answered_at
    FROM public.attempts a
    JOIN analytics_eligible_students es
      ON es.assignment_id = a.assignment_id
     AND es.user_id = a.user_id
    WHERE a.assignment_id = ANY (p_assignment_ids)
  ),
  active_attempt_respondents AS (
    SELECT DISTINCT sa.assignment_id, sa.user_id
    FROM scoped_attempts sa
    LEFT JOIN target_completion tc
      ON tc.assignment_id = sa.assignment_id
     AND tc.user_id = sa.user_id
    WHERE tc.last_completed_at IS NULL
       OR sa.answered_at > tc.last_completed_at
  ),
  completed_respondents AS (
    SELECT DISTINCT assignment_id, user_id
    FROM target_completion
    WHERE last_completed_at IS NOT NULL
  ),
  all_respondents AS (
    SELECT assignment_id, user_id FROM active_attempt_respondents
    UNION
    SELECT assignment_id, user_id FROM completed_respondents
  ),
  attempt_counts AS (
    SELECT assignment_id, COUNT(*)::integer AS attempt_count
    FROM scoped_attempts
    GROUP BY assignment_id
  ),
  respondent_counts AS (
    SELECT assignment_id, COUNT(DISTINCT user_id)::integer AS respondent_count
    FROM all_respondents
    GROUP BY assignment_id
  )
  SELECT
    sa.id AS assignment_id,
    COALESCE(attempt_counts.attempt_count, 0) AS attempt_count,
    COALESCE(respondent_counts.respondent_count, 0) AS respondent_count
  FROM scoped_assignments sa
  LEFT JOIN attempt_counts
    ON attempt_counts.assignment_id = sa.id
  LEFT JOIN respondent_counts
    ON respondent_counts.assignment_id = sa.id;
$$;

REVOKE ALL ON FUNCTION public.assignment_manage_counts(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assignment_manage_counts(text[]) FROM anon;
REVOKE ALL ON FUNCTION public.assignment_manage_counts(text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assignment_manage_counts(text[]) TO service_role;
