-- Optional per-question student notes written in the short-answer completion
-- section and browsed later on the /my-notes page. Strictly self-scoped.

CREATE TABLE IF NOT EXISTS "public"."student_question_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL DEFAULT auth.uid() REFERENCES "auth"."users" ("id") ON DELETE CASCADE,
  "question_id" text NOT NULL,
  "note_text" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "student_question_notes_user_question_unique"
    UNIQUE (user_id, question_id)
);

COMMENT ON TABLE "public"."student_question_notes" IS
  'Optional free-text notes a student writes on a question; self-scoped.';

CREATE INDEX IF NOT EXISTS "student_question_notes_user_updated_idx"
  ON "public"."student_question_notes" (user_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."student_question_notes" TO authenticated;
GRANT ALL ON TABLE "public"."student_question_notes" TO service_role;

ALTER TABLE "public"."student_question_notes" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_question_notes_all_own"
  ON "public"."student_question_notes";
CREATE POLICY "student_question_notes_all_own"
  ON "public"."student_question_notes"
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION "public"."student_question_notes_set_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "set_student_question_notes_updated_at"
  ON "public"."student_question_notes";
CREATE TRIGGER "set_student_question_notes_updated_at"
  BEFORE UPDATE ON "public"."student_question_notes"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."student_question_notes_set_updated_at"();
