-- Short-answer feedback configuration: which grading method/model/temperature
-- a school's students get. One optional row per school plus at most one
-- system-wide default row (scope='default'). Students have no access at all;
-- the grade route resolves the effective config server-side.

CREATE TABLE IF NOT EXISTS "public"."feedback_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scope" text NOT NULL,
  "school_id" text UNIQUE REFERENCES "public"."schools" ("id") ON DELETE CASCADE,
  "method" text NOT NULL,
  "model_id" text NOT NULL,
  "temperature" numeric(3, 2) NOT NULL,
  "updated_by" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "feedback_settings_scope_check"
    CHECK (scope IN ('school', 'default')),
  CONSTRAINT "feedback_settings_method_check"
    CHECK (method IN ('1', '2', '3')),
  CONSTRAINT "feedback_settings_school_scope_check"
    CHECK ((scope = 'school') = (school_id IS NOT NULL))
);

COMMENT ON TABLE "public"."feedback_settings" IS
  'Per-school short-answer feedback method/model/temperature, plus one system default row.';

-- At most one system-wide default row.
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_settings_single_default"
  ON "public"."feedback_settings" ((1))
  WHERE scope = 'default';

GRANT SELECT, INSERT, UPDATE ON TABLE "public"."feedback_settings" TO authenticated;
GRANT ALL ON TABLE "public"."feedback_settings" TO service_role;

ALTER TABLE "public"."feedback_settings" ENABLE ROW LEVEL SECURITY;

-- No student policies: students cannot read or write any row.
-- Teachers manage their own schools' rows; teachers may also READ the default
-- row so the settings UI can show the inherited configuration. Only admins
-- write the default row.

DROP POLICY IF EXISTS "feedback_settings_select_teacher_admin"
  ON "public"."feedback_settings";
CREATE POLICY "feedback_settings_select_teacher_admin"
  ON "public"."feedback_settings"
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_teacher()
      AND (scope = 'default' OR public.teacher_has_school_access(school_id))
    )
  );

DROP POLICY IF EXISTS "feedback_settings_insert_teacher_admin"
  ON "public"."feedback_settings";
CREATE POLICY "feedback_settings_insert_teacher_admin"
  ON "public"."feedback_settings"
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_teacher()
      AND scope = 'school'
      AND public.teacher_has_school_access(school_id)
    )
  );

DROP POLICY IF EXISTS "feedback_settings_update_teacher_admin"
  ON "public"."feedback_settings";
CREATE POLICY "feedback_settings_update_teacher_admin"
  ON "public"."feedback_settings"
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_teacher()
      AND scope = 'school'
      AND public.teacher_has_school_access(school_id)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_teacher()
      AND scope = 'school'
      AND public.teacher_has_school_access(school_id)
    )
  );

CREATE OR REPLACE FUNCTION "public"."feedback_settings_set_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "set_feedback_settings_updated_at"
  ON "public"."feedback_settings";
CREATE TRIGGER "set_feedback_settings_updated_at"
  BEFORE UPDATE ON "public"."feedback_settings"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."feedback_settings_set_updated_at"();
