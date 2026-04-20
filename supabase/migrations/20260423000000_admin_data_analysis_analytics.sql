-- Admin Data Analysis foundation tables.
-- Scope: school-level analytics with near-real-time interaction events.

CREATE TABLE IF NOT EXISTS public.analytics_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id text NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text,
  mode text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  client_started_at timestamptz,
  device_type text,
  browser text,
  os text,
  timezone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_school_started
  ON public.analytics_sessions (school_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user_started
  ON public.analytics_sessions (user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id text NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.analytics_sessions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  mode text,
  question_id text,
  assignment_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb,
  client_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_client_event_id_uniq
  ON public.analytics_events (client_event_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_school_occurred
  ON public.analytics_events (school_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_occurred
  ON public.analytics_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_occurred
  ON public.analytics_events (event_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.analytics_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id text NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.analytics_sessions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  assignment_id text,
  standard_id text,
  mode text NOT NULL,
  attempt_index integer,
  selected_choice_id text,
  is_correct boolean NOT NULL,
  correct_choice_id text,
  is_distractor boolean,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  time_to_submit_ms integer,
  hints_used_count integer,
  used_scaffold boolean,
  feedback_shown boolean,
  client_attempt_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS analytics_attempts_client_attempt_id_uniq
  ON public.analytics_attempts (client_attempt_id);
CREATE INDEX IF NOT EXISTS idx_analytics_attempts_school_submitted
  ON public.analytics_attempts (school_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_attempts_user_submitted
  ON public.analytics_attempts (user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_attempts_standard_submitted
  ON public.analytics_attempts (standard_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.analytics_data_quality_hourly (
  hour_bucket timestamptz NOT NULL,
  school_id text NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  zero_time_attempt_count integer NOT NULL DEFAULT 0,
  missing_attempt_log_count integer NOT NULL DEFAULT 0,
  duplicate_client_attempt_id_count integer NOT NULL DEFAULT 0,
  invalid_stage_transition_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hour_bucket, school_id)
);

ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_data_quality_hourly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_sessions_insert_self ON public.analytics_sessions;
CREATE POLICY analytics_sessions_insert_self
  ON public.analytics_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS analytics_events_insert_self ON public.analytics_events;
CREATE POLICY analytics_events_insert_self
  ON public.analytics_events
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS analytics_attempts_insert_self ON public.analytics_attempts;
CREATE POLICY analytics_attempts_insert_self
  ON public.analytics_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS analytics_sessions_read_admin_only ON public.analytics_sessions;
CREATE POLICY analytics_sessions_read_admin_only
  ON public.analytics_sessions
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS analytics_events_read_admin_only ON public.analytics_events;
CREATE POLICY analytics_events_read_admin_only
  ON public.analytics_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS analytics_attempts_read_admin_only ON public.analytics_attempts;
CREATE POLICY analytics_attempts_read_admin_only
  ON public.analytics_attempts
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS analytics_data_quality_hourly_read_admin_only ON public.analytics_data_quality_hourly;
CREATE POLICY analytics_data_quality_hourly_read_admin_only
  ON public.analytics_data_quality_hourly
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

GRANT ALL ON TABLE public.analytics_sessions TO authenticated;
GRANT ALL ON TABLE public.analytics_events TO authenticated;
GRANT ALL ON TABLE public.analytics_attempts TO authenticated;
GRANT ALL ON TABLE public.analytics_data_quality_hourly TO authenticated;
GRANT ALL ON TABLE public.analytics_sessions TO service_role;
GRANT ALL ON TABLE public.analytics_events TO service_role;
GRANT ALL ON TABLE public.analytics_attempts TO service_role;
GRANT ALL ON TABLE public.analytics_data_quality_hourly TO service_role;
