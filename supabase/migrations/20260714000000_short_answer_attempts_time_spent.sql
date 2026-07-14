-- Student answering time for short-answer attempts, in seconds, measured
-- client-side from when the part became answerable to submission (same
-- semantics as attempts.time_spent_sec for MCQs). NULL means the time was
-- not measured — rows written before this column existed cannot be
-- backfilled. Written server-side by the grade route.

ALTER TABLE "public"."short_answer_attempts"
  ADD COLUMN IF NOT EXISTS "time_spent_sec" integer;
