-- Add optional per-school student ID validation settings.
ALTER TABLE "public"."schools"
  ADD COLUMN IF NOT EXISTS "student_id_validation_pattern" text,
  ADD COLUMN IF NOT EXISTS "student_id_validation_hint" text;

COMMENT ON COLUMN "public"."schools"."student_id_validation_pattern" IS
  'Optional regex pattern used to validate student IDs on login for the school.';

COMMENT ON COLUMN "public"."schools"."student_id_validation_hint" IS
  'Optional human-friendly hint shown to students when entering student IDs.';
