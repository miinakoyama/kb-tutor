-- Student reports that a part's AI feedback seems wrong or confusing.
-- The referenced attempt row supplies the submitted answer and the feedback
-- that was shown; teachers of the student's schools review and resolve.

CREATE TABLE IF NOT EXISTS "public"."feedback_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_user_id" uuid NOT NULL DEFAULT auth.uid() REFERENCES "auth"."users" ("id") ON DELETE CASCADE,
  "attempt_id" uuid NOT NULL REFERENCES "public"."short_answer_attempts" ("id") ON DELETE CASCADE,
  "question_id" text NOT NULL,
  "part_label" text NOT NULL,
  "note" text,
  "reviewed_at" timestamptz,
  "reviewed_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "feedback_reports_part_label_check"
    CHECK (part_label IN ('A', 'B', 'C')),
  CONSTRAINT "feedback_reports_one_per_attempt"
    UNIQUE (student_user_id, attempt_id)
);

COMMENT ON TABLE "public"."feedback_reports" IS
  'Student-filed reports about short-answer AI feedback, reviewed by teachers.';

CREATE INDEX IF NOT EXISTS "feedback_reports_reviewed_at_idx"
  ON "public"."feedback_reports" (reviewed_at);
CREATE INDEX IF NOT EXISTS "feedback_reports_created_at_idx"
  ON "public"."feedback_reports" (created_at);

GRANT SELECT, INSERT, UPDATE ON TABLE "public"."feedback_reports" TO authenticated;
GRANT ALL ON TABLE "public"."feedback_reports" TO service_role;

ALTER TABLE "public"."feedback_reports" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback_reports_insert_own"
  ON "public"."feedback_reports";
CREATE POLICY "feedback_reports_insert_own"
  ON "public"."feedback_reports"
  FOR INSERT TO authenticated
  WITH CHECK (student_user_id = auth.uid());

DROP POLICY IF EXISTS "feedback_reports_select_scoped"
  ON "public"."feedback_reports";
CREATE POLICY "feedback_reports_select_scoped"
  ON "public"."feedback_reports"
  FOR SELECT TO authenticated
  USING (
    student_user_id = auth.uid()
    OR public.is_admin()
    OR (public.is_teacher() AND public.teacher_can_read_student_profile(student_user_id))
  );

-- Teachers/admins mark reports reviewed (reviewed_at / reviewed_by).
DROP POLICY IF EXISTS "feedback_reports_update_teacher_admin"
  ON "public"."feedback_reports";
CREATE POLICY "feedback_reports_update_teacher_admin"
  ON "public"."feedback_reports"
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (public.is_teacher() AND public.teacher_can_read_student_profile(student_user_id))
  )
  WITH CHECK (
    public.is_admin()
    OR (public.is_teacher() AND public.teacher_can_read_student_profile(student_user_id))
  );
