-- Add mode, randomize_order, and review scope columns to assignments.

ALTER TABLE "public"."assignments"
  ADD COLUMN IF NOT EXISTS "mode" text NOT NULL DEFAULT 'practice',
  ADD COLUMN IF NOT EXISTS "randomize_order" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "max_questions" integer,
  ADD COLUMN IF NOT EXISTS "review_topics" text[],
  ADD COLUMN IF NOT EXISTS "review_standards" text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assignments_mode_check'
  ) THEN
    ALTER TABLE "public"."assignments"
      ADD CONSTRAINT "assignments_mode_check"
      CHECK ("mode" IN ('practice', 'exam', 'review'));
  END IF;
END$$;
