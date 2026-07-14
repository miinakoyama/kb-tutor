-- Students can read their own analytics_sessions rows, so the homepage can
-- render the "Learning effort" chart from real session durations.
--
-- The existing analytics_sessions_read_admin_only policy stays untouched:
-- Postgres ORs permissive SELECT policies together, so admins keep full read
-- access and students gain exactly their own rows and nothing else.

DROP POLICY IF EXISTS analytics_sessions_read_self ON public.analytics_sessions;
CREATE POLICY analytics_sessions_read_self
  ON public.analytics_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
