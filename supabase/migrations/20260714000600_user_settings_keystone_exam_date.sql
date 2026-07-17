-- Per-student Keystone exam date override, editable from the homepage
-- countdown card. The school-level schools.keystone_exam_date remains the
-- default for everyone; a student's own date (e.g. a different sitting)
-- takes precedence for their countdown only. NULL = use the school date.
-- user_settings already has self-all RLS (user_settings_self_all).

ALTER TABLE "public"."user_settings"
  ADD COLUMN IF NOT EXISTS "keystone_exam_date" date;
