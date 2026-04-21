-- Per-question quality diagnostics views.
-- Lifetime aggregates derived from public.attempts. Date-filtered variants are
-- done in the API layer when needed (directly from public.attempts).

-- Per (question_id, mode) accuracy, unique users, and time percentiles.
CREATE OR REPLACE VIEW public.question_stats_v AS
SELECT
  question_id,
  mode,
  MAX(standard_id)    AS standard_id,
  MAX(standard_label) AS standard_label,
  COUNT(*)::int                                                        AS attempts_n,
  COUNT(DISTINCT user_id)::int                                         AS unique_users,
  COUNT(*) FILTER (WHERE is_correct)::int                              AS correct_n,
  AVG(CASE WHEN is_correct THEN 1 ELSE 0 END)::numeric(5, 4)           AS accuracy,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY time_spent_sec)::numeric(10, 2) AS time_p50,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY time_spent_sec)::numeric(10, 2) AS time_p90,
  AVG(time_spent_sec)::numeric(10, 2)                                  AS time_avg,
  MIN(answered_at)                                                     AS first_answered_at,
  MAX(answered_at)                                                     AS last_answered_at
FROM public.attempts
GROUP BY question_id, mode;

-- Per (question_id, mode, selected_option_id) selection rate.
CREATE OR REPLACE VIEW public.question_choice_stats_v AS
WITH totals AS (
  SELECT question_id, mode, COUNT(*) AS total_n
  FROM public.attempts
  GROUP BY question_id, mode
)
SELECT
  a.question_id,
  a.mode,
  a.selected_option_id,
  COUNT(*)::int                                                 AS n,
  BOOL_OR(a.is_correct)                                         AS is_correct_choice,
  (COUNT(*)::numeric / NULLIF(t.total_n, 0))::numeric(5, 4)     AS share
FROM public.attempts a
JOIN totals t
  ON t.question_id = a.question_id
 AND t.mode        = a.mode
GROUP BY a.question_id, a.mode, a.selected_option_id, t.total_n;

-- Practice first-attempt accuracy per question (per (user_id, question_id)).
-- Captures whether a student gets it right on the first try before any scaffolding loop.
CREATE OR REPLACE VIEW public.practice_first_attempt_accuracy_v AS
WITH first_attempts AS (
  SELECT DISTINCT ON (user_id, question_id)
    user_id,
    question_id,
    is_correct,
    answered_at
  FROM public.attempts
  WHERE mode = 'practice'
  ORDER BY user_id, question_id, answered_at ASC
)
SELECT
  question_id,
  COUNT(*)::int                                            AS first_attempt_n,
  COUNT(*) FILTER (WHERE is_correct)::int                  AS first_attempt_correct,
  AVG(CASE WHEN is_correct THEN 1 ELSE 0 END)::numeric(5, 4) AS first_attempt_accuracy
FROM first_attempts
GROUP BY question_id;

-- Views inherit RLS from public.attempts. Admin reads go through the service role
-- client in the API layer, so we only grant SELECT defensively here.
GRANT SELECT ON public.question_stats_v                   TO authenticated, service_role;
GRANT SELECT ON public.question_choice_stats_v            TO authenticated, service_role;
GRANT SELECT ON public.practice_first_attempt_accuracy_v  TO authenticated, service_role;
