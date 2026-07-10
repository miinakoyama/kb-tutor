-- First-time onboarding spotlight tour for the short-answer screen (FR-018).
-- Set when the tour is completed or skipped; NULL means auto-open on next view.
-- Same pattern as user_settings.onboarding_completed_at.

ALTER TABLE "public"."user_settings"
  ADD COLUMN IF NOT EXISTS "short_answer_tour_seen_at" timestamptz;

COMMENT ON COLUMN "public"."user_settings"."short_answer_tour_seen_at" IS
  'When the student completed or skipped the short-answer onboarding tour.';
