-- Scope short-answer attempt slots per assignment run so students can retry
-- assignments without colliding with prior-run rows (mirrors MCQ resume via
-- assignment_targets.last_completed_at).

ALTER TABLE "public"."short_answer_attempts"
  ADD COLUMN IF NOT EXISTS "assignment_run_after" timestamptz;

COMMENT ON COLUMN "public"."short_answer_attempts"."assignment_run_after" IS
  'Snapshot of assignment_targets.last_completed_at when this run started; NULL for the first run.';

DROP INDEX IF EXISTS "public"."short_answer_attempts_slot_unique";

CREATE UNIQUE INDEX "short_answer_attempts_slot_unique"
  ON "public"."short_answer_attempts" (
    "user_id",
    "question_id",
    "part_label",
    "attempt_number",
    "assignment_id",
    "assignment_run_after"
  )
  NULLS NOT DISTINCT
  WHERE "assignment_id" IS NOT NULL;
