-- Notes are available while a student is still working on a question.
-- Preview enrichment remains guarded in /api/student-notes, so allowing a
-- self-owned note before an attempt does not expose question payloads.

DROP POLICY IF EXISTS "student_question_notes_insert_answered"
  ON "public"."student_question_notes";
CREATE POLICY "student_question_notes_insert_own"
  ON "public"."student_question_notes"
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "student_question_notes_update_answered"
  ON "public"."student_question_notes";
CREATE POLICY "student_question_notes_update_own"
  ON "public"."student_question_notes"
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
