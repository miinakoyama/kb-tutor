-- Dwell heartbeats for non-question-answering study time (currently: the
-- Review tab). The client flushes one small row per ~30s of *visible* time,
-- so a crashed tab loses at most the last partial interval — unlike
-- analytics_sessions, whose ended_at depends on an exit beacon that often
-- never fires. Consumed by the homepage Learning effort chart.

CREATE TABLE IF NOT EXISTS "public"."page_dwell_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL DEFAULT auth.uid()
    REFERENCES "auth"."users" ("id") ON DELETE CASCADE,
  "page" text NOT NULL,
  -- One flush interval of visible time. The cap bounds what a hostile or
  -- buggy client can claim per row.
  "seconds" integer NOT NULL CHECK ("seconds" >= 1 AND "seconds" <= 120),
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_page_dwell_events_user_occurred
  ON "public"."page_dwell_events" ("user_id", "occurred_at" DESC);

ALTER TABLE "public"."page_dwell_events" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS page_dwell_events_insert_self ON "public"."page_dwell_events";
CREATE POLICY page_dwell_events_insert_self
  ON "public"."page_dwell_events"
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS page_dwell_events_read_self ON "public"."page_dwell_events";
CREATE POLICY page_dwell_events_read_self
  ON "public"."page_dwell_events"
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT ON TABLE "public"."page_dwell_events" TO authenticated;
GRANT ALL ON TABLE "public"."page_dwell_events" TO service_role;
