-- Insights aggregation pushed into Postgres.
--
-- Prior to this migration the /api/admin/analytics/insights route pulled up
-- to 100k raw rows from `public.attempts` / `public.analytics_events` /
-- `public.analytics_sessions` and aggregated in Node. That approach hits
-- memory and execution-time limits as data grows.
--
-- These RPCs do the per-group work in Postgres and return only the collapsed
-- rows (one per (user, question), (user, session), (user, mode), etc.).
-- The API still does the lightweight rollup to overall / by-standard /
-- by-student because that logic is cheap and easier to iterate on in TS.
--
-- All functions are STABLE + SECURITY INVOKER. When the API route uses the
-- service role client (which bypasses RLS) they have full visibility; when
-- called as a regular authenticated user, RLS on the underlying tables
-- applies, so callers only see rows they could read directly.

-- ---------------------------------------------------------------------------
-- Q2 / Q3 — Practice attempts collapsed to first vs final per (user, question)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insights_practice_summary(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS TABLE (
  user_id          uuid,
  question_id      text,
  standard_id      text,
  standard_label   text,
  first_is_correct boolean,
  final_is_correct boolean,
  attempt_count    integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    user_id,
    question_id,
    (array_agg(standard_id    ORDER BY answered_at ASC))[1]  AS standard_id,
    (array_agg(standard_label ORDER BY answered_at ASC))[1]  AS standard_label,
    (array_agg(is_correct     ORDER BY answered_at ASC))[1]  AS first_is_correct,
    (array_agg(is_correct     ORDER BY answered_at DESC))[1] AS final_is_correct,
    COUNT(*)::int                                            AS attempt_count
  FROM public.attempts
  WHERE mode = 'practice'
    AND answered_at >= p_from
    AND answered_at <= p_to
  GROUP BY user_id, question_id;
$$;

-- ---------------------------------------------------------------------------
-- Q3 — Exam attempts collapsed to the latest attempt per (user, question)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insights_exam_summary(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS TABLE (
  user_id        uuid,
  question_id    text,
  standard_id    text,
  standard_label text,
  is_correct     boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT DISTINCT ON (user_id, question_id)
    user_id,
    question_id,
    standard_id,
    standard_label,
    is_correct
  FROM public.attempts
  WHERE mode = 'exam'
    AND answered_at >= p_from
    AND answered_at <= p_to
  ORDER BY user_id, question_id, answered_at DESC;
$$;

-- ---------------------------------------------------------------------------
-- Q4 — Review mode dwell per (user, session), paired entered / exited
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insights_review_dwell(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS TABLE (
  user_id    uuid,
  session_id uuid,
  dwell_ms   bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH entered AS (
    SELECT user_id, session_id, MIN(occurred_at) AS entered_at
    FROM public.analytics_events
    WHERE event_type = 'review_mode_entered'
      AND occurred_at >= p_from
      AND occurred_at <= p_to
      AND session_id IS NOT NULL
    GROUP BY user_id, session_id
  ),
  exited AS (
    SELECT session_id, MAX(occurred_at) AS exited_at
    FROM public.analytics_events
    WHERE event_type = 'review_mode_exited'
      AND occurred_at >= p_from
      AND occurred_at <= p_to
      AND session_id IS NOT NULL
    GROUP BY session_id
  )
  SELECT
    e.user_id,
    e.session_id,
    (EXTRACT(EPOCH FROM (x.exited_at - e.entered_at)) * 1000)::bigint AS dwell_ms
  FROM entered e
  JOIN exited x ON x.session_id = e.session_id
  WHERE x.exited_at > e.entered_at
    AND (x.exited_at - e.entered_at) < INTERVAL '6 hours';
$$;

-- ---------------------------------------------------------------------------
-- Q4 — Set of users who entered review at all (including no-exit pairs)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insights_review_entered_users(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT DISTINCT user_id
  FROM public.analytics_events
  WHERE event_type IN ('review_mode_entered', 'review_item_opened')
    AND occurred_at >= p_from
    AND occurred_at <= p_to;
$$;

-- ---------------------------------------------------------------------------
-- Q5 — Stage event counts per (user, mode)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insights_stage_counts(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS TABLE (
  user_id     uuid,
  mode        text,
  started_n   integer,
  completed_n integer,
  abandoned_n integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    user_id,
    COALESCE(mode, 'unknown')                                   AS mode,
    COUNT(*) FILTER (WHERE event_type = 'stage_started')::int   AS started_n,
    COUNT(*) FILTER (WHERE event_type = 'stage_completed')::int AS completed_n,
    COUNT(*) FILTER (WHERE event_type = 'stage_abandoned')::int AS abandoned_n
  FROM public.analytics_events
  WHERE event_type IN ('stage_started', 'stage_completed', 'stage_abandoned')
    AND occurred_at >= p_from
    AND occurred_at <= p_to
  GROUP BY user_id, COALESCE(mode, 'unknown');
$$;

-- ---------------------------------------------------------------------------
-- Q5 — Per-session duration, filtered to sensible values
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insights_session_durations(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS TABLE (
  mode        text,
  duration_ms bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    mode,
    (EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000)::bigint AS duration_ms
  FROM public.analytics_sessions
  WHERE started_at >= p_from
    AND started_at <= p_to
    AND ended_at IS NOT NULL
    AND ended_at > started_at
    AND (ended_at - started_at) < INTERVAL '6 hours';
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.insights_practice_summary(timestamptz, timestamptz)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insights_exam_summary(timestamptz, timestamptz)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insights_review_dwell(timestamptz, timestamptz)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insights_review_entered_users(timestamptz, timestamptz)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insights_stage_counts(timestamptz, timestamptz)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insights_session_durations(timestamptz, timestamptz)      TO authenticated, service_role;
