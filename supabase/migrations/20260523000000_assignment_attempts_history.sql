-- Per-student assignment retry tracking.
--
-- This migration introduces two related pieces of state:
--
--   1. `assignments.max_attempts` (nullable int):
--      Optional per-assignment cap on the number of full runs a student can
--      complete. NULL means unlimited (current behavior). When set, the
--      student is blocked from starting a new run after hitting the cap.
--
--   2. `assignment_completions` table:
--      One row per completed run by a (student, assignment). Lets students
--      look back at each prior attempt independently of `attempts`, which
--      otherwise mixes attempts across runs together. Also drives the
--      "Attempt X of Y" UI surface and acts as the source of truth for
--      max_attempts enforcement.
--
-- We intentionally keep `assignment_targets.last_completed_at` for backward
-- compatibility (it still indicates "this student finished at least once" and
-- scopes the resume-answered map). The new table is additive.
ALTER TABLE "public"."assignments"
  ADD COLUMN IF NOT EXISTS "max_attempts" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assignments_max_attempts_check'
  ) THEN
    ALTER TABLE "public"."assignments"
      ADD CONSTRAINT "assignments_max_attempts_check"
      CHECK ("max_attempts" IS NULL OR "max_attempts" >= 1);
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "public"."assignment_completions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "assignment_id" text NOT NULL,
  "student_user_id" uuid NOT NULL,
  "attempt_number" integer NOT NULL,
  "started_at" timestamptz NOT NULL,
  "completed_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "assignment_completions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assignment_completions_attempt_unique"
    UNIQUE ("assignment_id", "student_user_id", "attempt_number"),
  CONSTRAINT "assignment_completions_attempt_positive"
    CHECK ("attempt_number" >= 1)
);

ALTER TABLE "public"."assignment_completions" OWNER TO "postgres";

ALTER TABLE ONLY "public"."assignment_completions"
  ADD CONSTRAINT "assignment_completions_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."assignment_completions"
  ADD CONSTRAINT "assignment_completions_student_user_id_fkey"
  FOREIGN KEY ("student_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_assignment_completions_student"
  ON "public"."assignment_completions" ("student_user_id", "assignment_id", "attempt_number" DESC);
CREATE INDEX IF NOT EXISTS "idx_assignment_completions_assignment"
  ON "public"."assignment_completions" ("assignment_id");

ALTER TABLE "public"."assignment_completions" ENABLE ROW LEVEL SECURITY;

-- Students can see their own completions; teachers can see completions for
-- assignments they created or for schools they administer; admins see all.
CREATE POLICY "assignment_completions_read_scoped"
  ON "public"."assignment_completions"
  FOR SELECT TO "authenticated"
  USING (
    "public"."is_admin"()
    OR ("student_user_id" = "auth"."uid"())
    OR (
      EXISTS (
        SELECT 1
        FROM "public"."assignments" "a"
        WHERE "a"."id" = "assignment_completions"."assignment_id"
          AND "a"."created_by" = "auth"."uid"()
      )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM "public"."assignments" "a"
        JOIN "public"."school_teachers" "st"
          ON "st"."school_id" = "a"."school_id"
        WHERE "a"."id" = "assignment_completions"."assignment_id"
          AND "st"."teacher_user_id" = "auth"."uid"()
      )
    )
  );

GRANT ALL ON TABLE "public"."assignment_completions" TO "anon";
GRANT ALL ON TABLE "public"."assignment_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_completions" TO "service_role";
