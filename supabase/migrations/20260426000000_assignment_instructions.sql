-- Add an optional, teacher-authored instruction note to assignments.
--
-- Surfaced on the student-side card (e.g. "do this after assignment 1")
-- and editable from the teacher-side edit form. Nullable because it is
-- optional; plain TEXT because it can be long-form with line breaks.

ALTER TABLE "public"."assignments"
  ADD COLUMN IF NOT EXISTS "instructions" text;
