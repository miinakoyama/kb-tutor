-- Scope non-assignment short-answer attempt caps to the current practice/exam
-- analytics session. Assignment runs continue to use assignment_id plus the
-- assignment retry boundary.

ALTER TABLE "public"."short_answer_attempts"
  ADD COLUMN IF NOT EXISTS "session_id" uuid
  REFERENCES "public"."analytics_sessions" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "short_answer_attempts_session_idx"
  ON "public"."short_answer_attempts" (session_id);
