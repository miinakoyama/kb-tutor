-- Optional per-school notice shown on the student login page when that school is selected.
ALTER TABLE "public"."schools"
  ADD COLUMN IF NOT EXISTS "student_login_notice" text;

COMMENT ON COLUMN "public"."schools"."student_login_notice" IS
  'When non-empty, shown prominently on /login below Student ID for students who select this school.';
