-- Per-teacher overrides for the performance-band thresholds rendered on
-- the Teacher Dashboard. Each teacher gets at most one row; defaults
-- (see src/lib/analytics/constants.ts) are applied when no row exists.
--
-- Bands align with the Pennsylvania Keystone Biology performance levels
-- (Below Basic / Basic / Proficient / Advanced) and are stored as
-- inclusive lower-bound accuracy percentages in [0, 100]. The CHECK
-- constraint enforces monotonicity so the dashboard never has to deal
-- with overlapping bands.

CREATE TABLE IF NOT EXISTS "public"."teacher_performance_thresholds" (
  "user_id" uuid PRIMARY KEY REFERENCES "auth"."users" ("id") ON DELETE CASCADE,
  "student_basic_min" integer NOT NULL DEFAULT 50,
  "student_proficient_min" integer NOT NULL DEFAULT 70,
  "student_advanced_min" integer NOT NULL DEFAULT 85,
  "standard_basic_min" integer NOT NULL DEFAULT 50,
  "standard_proficient_min" integer NOT NULL DEFAULT 70,
  "standard_advanced_min" integer NOT NULL DEFAULT 85,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "teacher_performance_thresholds_student_range" CHECK (
    student_basic_min BETWEEN 0 AND 100
    AND student_proficient_min BETWEEN 0 AND 100
    AND student_advanced_min BETWEEN 0 AND 100
    AND student_basic_min <= student_proficient_min
    AND student_proficient_min <= student_advanced_min
  ),
  CONSTRAINT "teacher_performance_thresholds_standard_range" CHECK (
    standard_basic_min BETWEEN 0 AND 100
    AND standard_proficient_min BETWEEN 0 AND 100
    AND standard_advanced_min BETWEEN 0 AND 100
    AND standard_basic_min <= standard_proficient_min
    AND standard_proficient_min <= standard_advanced_min
  )
);

COMMENT ON TABLE "public"."teacher_performance_thresholds" IS
  'Per-teacher overrides for performance-band cutoffs used on the Teacher Dashboard.';

ALTER TABLE "public"."teacher_performance_thresholds" ENABLE ROW LEVEL SECURITY;

-- A teacher may always read and modify their own row. Admins use the
-- service-role key from server routes and bypass RLS entirely; no
-- additional admin policy is required.
DROP POLICY IF EXISTS "teacher_performance_thresholds_select_own"
  ON "public"."teacher_performance_thresholds";
CREATE POLICY "teacher_performance_thresholds_select_own"
  ON "public"."teacher_performance_thresholds"
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "teacher_performance_thresholds_insert_own"
  ON "public"."teacher_performance_thresholds";
CREATE POLICY "teacher_performance_thresholds_insert_own"
  ON "public"."teacher_performance_thresholds"
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "teacher_performance_thresholds_update_own"
  ON "public"."teacher_performance_thresholds";
CREATE POLICY "teacher_performance_thresholds_update_own"
  ON "public"."teacher_performance_thresholds"
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "teacher_performance_thresholds_delete_own"
  ON "public"."teacher_performance_thresholds";
CREATE POLICY "teacher_performance_thresholds_delete_own"
  ON "public"."teacher_performance_thresholds"
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Maintain updated_at on row mutations so the API can serve a fresh
-- value without having to compute it client-side.
CREATE OR REPLACE FUNCTION "public"."teacher_performance_thresholds_set_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "set_teacher_performance_thresholds_updated_at"
  ON "public"."teacher_performance_thresholds";
CREATE TRIGGER "set_teacher_performance_thresholds_updated_at"
  BEFORE UPDATE ON "public"."teacher_performance_thresholds"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."teacher_performance_thresholds_set_updated_at"();
