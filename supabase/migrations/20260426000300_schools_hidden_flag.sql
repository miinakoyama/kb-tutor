-- Add per-school visibility control for student login.
ALTER TABLE "public"."schools"
  ADD COLUMN IF NOT EXISTS "is_hidden" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "idx_schools_is_hidden_name"
  ON "public"."schools" ("is_hidden", "name");

COMMENT ON COLUMN "public"."schools"."is_hidden" IS
  'When true, the school is hidden from student login and student self-registration is blocked.';
