-- Break RLS policy recursion between school_members / schools / school_teachers.
--
-- Previously:
--   * school_members_read_scoped  had EXISTS(schools) + EXISTS(school_teachers)
--   * schools_read_members_*      had EXISTS(school_teachers) + EXISTS(school_members)
--   * school_teachers_read_scoped had EXISTS(school_members)
--
-- Postgres flagged the cycle as "infinite recursion detected in policy for
-- relation school_members", which also cascaded into any query that transitively
-- walks these tables (including the profiles policy's teacher branch).
--
-- Fix: wrap the access checks in SECURITY DEFINER functions that bypass RLS,
-- then rewrite the affected policies to call those helpers instead of querying
-- RLS-protected tables directly from within a policy.

CREATE OR REPLACE FUNCTION "public"."teacher_has_school_access"("p_school_id" "text")
  RETURNS boolean
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = p_school_id AND s.teacher_user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.school_teachers st
      WHERE st.school_id = p_school_id AND st.teacher_user_id = auth.uid()
    );
  $$;

ALTER FUNCTION "public"."teacher_has_school_access"("p_school_id" "text") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."teacher_has_school_access"("p_school_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."teacher_has_school_access"("p_school_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."teacher_has_school_access"("p_school_id" "text") TO "service_role";

-- school_members --------------------------------------------------------------

DROP POLICY IF EXISTS "school_members_read_scoped" ON "public"."school_members";
CREATE POLICY "school_members_read_scoped" ON "public"."school_members"
  FOR SELECT TO "authenticated"
  USING (
    public.is_admin()
    OR student_user_id = auth.uid()
    OR public.teacher_has_school_access(school_id)
  );

DROP POLICY IF EXISTS "school_members_write_teacher_admin" ON "public"."school_members";
CREATE POLICY "school_members_write_teacher_admin" ON "public"."school_members"
  TO "authenticated"
  USING (
    public.is_admin()
    OR public.teacher_has_school_access(school_id)
  )
  WITH CHECK (
    public.is_admin()
    OR public.teacher_has_school_access(school_id)
  );

-- schools ---------------------------------------------------------------------

DROP POLICY IF EXISTS "schools_read_members_teacher_admin" ON "public"."schools";
CREATE POLICY "schools_read_members_teacher_admin" ON "public"."schools"
  FOR SELECT TO "authenticated"
  USING (
    public.is_admin()
    OR teacher_user_id = auth.uid()
    OR public.teacher_has_school_access(id)
    OR public.student_is_member_of_school(id)
  );

-- school_teachers -------------------------------------------------------------

DROP POLICY IF EXISTS "school_teachers_read_scoped" ON "public"."school_teachers";
CREATE POLICY "school_teachers_read_scoped" ON "public"."school_teachers"
  FOR SELECT TO "authenticated"
  USING (
    public.is_admin()
    OR teacher_user_id = auth.uid()
    OR public.student_is_member_of_school(school_id)
  );

-- profiles --------------------------------------------------------------------
-- The teacher branch still joins school_members + schools. Move that into a
-- SECURITY DEFINER helper so querying profiles never re-enters RLS on the
-- school_* tables.

CREATE OR REPLACE FUNCTION "public"."teacher_can_read_student_profile"("p_student_user_id" "uuid")
  RETURNS boolean
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.school_members sm
      JOIN public.schools s ON s.id = sm.school_id
      LEFT JOIN public.school_teachers st ON st.school_id = s.id
      WHERE sm.student_user_id = p_student_user_id
        AND (s.teacher_user_id = auth.uid() OR st.teacher_user_id = auth.uid())
    );
  $$;

ALTER FUNCTION "public"."teacher_can_read_student_profile"("p_student_user_id" "uuid") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."teacher_can_read_student_profile"("p_student_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."teacher_can_read_student_profile"("p_student_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."teacher_can_read_student_profile"("p_student_user_id" "uuid") TO "service_role";

DROP POLICY IF EXISTS "profiles_read_self_teacher_admin" ON "public"."profiles";
CREATE POLICY "profiles_read_self_teacher_admin" ON "public"."profiles"
  FOR SELECT TO "authenticated"
  USING (
    id = auth.uid()
    OR public.is_admin()
    OR (public.is_teacher() AND public.teacher_can_read_student_profile(id))
  );
