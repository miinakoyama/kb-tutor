-- Add keystone_exam_date to schools so admins can configure per-school
-- exam dates and display a countdown on the student home page.

ALTER TABLE "public"."schools"
  ADD COLUMN IF NOT EXISTS "keystone_exam_date" date;
