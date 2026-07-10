-- Short-answer (constructed-response) part attempts.
-- One row per graded submission of one part. Written server-side by the
-- grade route with the service-role client; feedback/method metadata
-- captured per attempt for method comparison (spec FR-022 / SC-005).

CREATE TABLE IF NOT EXISTS "public"."short_answer_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL DEFAULT auth.uid() REFERENCES "auth"."users" ("id") ON DELETE CASCADE,
  "question_id" text NOT NULL,
  "question_set_id" text REFERENCES "public"."generated_question_sets" ("id") ON DELETE SET NULL,
  "assignment_id" text,
  "part_label" text NOT NULL,
  "attempt_number" smallint NOT NULL,
  "client_attempt_id" uuid NOT NULL UNIQUE,
  "mode" text NOT NULL,
  "response_text" text NOT NULL,
  "score" smallint NOT NULL,
  "max_score" smallint NOT NULL,
  "is_correct" boolean NOT NULL,
  "feedback" jsonb NOT NULL,
  "diagnosed_gap" text,
  "confidence" text,
  "method" text NOT NULL,
  "model_id" text,
  "temperature" numeric(3, 2),
  "token_count" integer,
  "latency_ms" integer,
  "answered_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "short_answer_attempts_part_label_check"
    CHECK (part_label IN ('A', 'B', 'C')),
  CONSTRAINT "short_answer_attempts_attempt_number_check"
    CHECK (attempt_number IN (1, 2)),
  CONSTRAINT "short_answer_attempts_mode_check"
    CHECK (mode IN ('practice', 'exam', 'review')),
  CONSTRAINT "short_answer_attempts_confidence_check"
    CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low')),
  CONSTRAINT "short_answer_attempts_method_check"
    CHECK (method IN ('1', '2', '3', 'none')),
  CONSTRAINT "short_answer_attempts_score_range_check"
    CHECK (score >= 0 AND score <= max_score)
);

COMMENT ON TABLE "public"."short_answer_attempts" IS
  'One graded submission of one short-answer part, with AI feedback and method/model metrics.';

-- One row per attempt slot per context. NULL assignment_ids are distinct, so
-- self-practice re-runs simply create new rows; the 2-attempt cap is enforced
-- server-side in the grade route.
CREATE UNIQUE INDEX IF NOT EXISTS "short_answer_attempts_slot_unique"
  ON "public"."short_answer_attempts" (user_id, question_id, part_label, attempt_number, assignment_id)
  WHERE assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS "short_answer_attempts_user_question_idx"
  ON "public"."short_answer_attempts" (user_id, question_id);
CREATE INDEX IF NOT EXISTS "short_answer_attempts_assignment_idx"
  ON "public"."short_answer_attempts" (assignment_id);
CREATE INDEX IF NOT EXISTS "short_answer_attempts_answered_at_idx"
  ON "public"."short_answer_attempts" (answered_at);
CREATE INDEX IF NOT EXISTS "short_answer_attempts_method_model_idx"
  ON "public"."short_answer_attempts" (method, model_id);

GRANT SELECT ON TABLE "public"."short_answer_attempts" TO authenticated;
GRANT ALL ON TABLE "public"."short_answer_attempts" TO service_role;

ALTER TABLE "public"."short_answer_attempts" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "short_answer_attempts_insert_own"
  ON "public"."short_answer_attempts";

DROP POLICY IF EXISTS "short_answer_attempts_select_scoped"
  ON "public"."short_answer_attempts";
CREATE POLICY "short_answer_attempts_select_scoped"
  ON "public"."short_answer_attempts"
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR (public.is_teacher() AND public.teacher_can_read_student_profile(user_id))
  );
