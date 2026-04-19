-- Track per-student assignment completion. NULL means not yet completed by
-- that student. Updated to now() whenever the student finishes all questions
-- in a single session (practice/exam) or completes one full review run.

ALTER TABLE "public"."assignment_targets"
  ADD COLUMN IF NOT EXISTS "last_completed_at" timestamptz;
