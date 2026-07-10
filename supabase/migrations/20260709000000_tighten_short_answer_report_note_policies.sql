-- Tighten student-authored short-answer rows so forged self-scoped records
-- cannot point at unrelated attempts/questions and later be enriched by
-- service-role reads.

DROP POLICY IF EXISTS "feedback_reports_insert_own"
  ON "public"."feedback_reports";
CREATE POLICY "feedback_reports_insert_own"
  ON "public"."feedback_reports"
  FOR INSERT TO authenticated
  WITH CHECK (
    student_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM "public"."short_answer_attempts" saa
      WHERE saa.id = attempt_id
        AND saa.user_id = auth.uid()
        AND saa.question_id = feedback_reports.question_id
        AND saa.part_label = feedback_reports.part_label
    )
  );

DROP POLICY IF EXISTS "student_question_notes_all_own"
  ON "public"."student_question_notes";
CREATE POLICY "student_question_notes_select_delete_own"
  ON "public"."student_question_notes"
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "student_question_notes_delete_own"
  ON "public"."student_question_notes"
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "student_question_notes_insert_answered"
  ON "public"."student_question_notes"
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1
        FROM "public"."attempts" a
        WHERE a.user_id = auth.uid()
          AND a.question_id = student_question_notes.question_id
      )
      OR EXISTS (
        SELECT 1
        FROM "public"."short_answer_attempts" saa
        WHERE saa.user_id = auth.uid()
          AND saa.question_id = student_question_notes.question_id
      )
    )
  );

CREATE POLICY "student_question_notes_update_answered"
  ON "public"."student_question_notes"
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1
        FROM "public"."attempts" a
        WHERE a.user_id = auth.uid()
          AND a.question_id = student_question_notes.question_id
      )
      OR EXISTS (
        SELECT 1
        FROM "public"."short_answer_attempts" saa
        WHERE saa.user_id = auth.uid()
          AND saa.question_id = student_question_notes.question_id
      )
    )
  );
