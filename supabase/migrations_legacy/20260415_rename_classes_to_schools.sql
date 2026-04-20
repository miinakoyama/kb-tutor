-- Migration: Rename class model to school model + student self-registration support
-- classes → schools, class_members → school_members, class_teachers → school_teachers
-- assignments.class_id → assignments.school_id
-- Drop UNIQUE constraint on profiles.student_id (allow same studentID in different schools)

-- Step 1: Rename tables
ALTER TABLE IF EXISTS public.classes RENAME TO schools;
ALTER TABLE IF EXISTS public.class_members RENAME TO school_members;
ALTER TABLE IF EXISTS public.class_teachers RENAME TO school_teachers;

-- Step 2: Rename columns
ALTER TABLE IF EXISTS public.school_members RENAME COLUMN class_id TO school_id;
ALTER TABLE IF EXISTS public.school_teachers RENAME COLUMN class_id TO school_id;
ALTER TABLE IF EXISTS public.assignments RENAME COLUMN class_id TO school_id;

-- Step 3a: Make schools.teacher_user_id nullable
--   (Teacher assignment is handled via school_teachers junction table)
ALTER TABLE public.schools ALTER COLUMN teacher_user_id DROP NOT NULL;

-- Step 3b: Drop UNIQUE constraint on profiles.student_id
--   (Same studentID can exist in different schools; uniqueness is now school-scoped)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_student_id_key;
CREATE INDEX IF NOT EXISTS idx_profiles_student_id ON public.profiles(student_id);

-- Step 4: Recreate indexes with new names
DROP INDEX IF EXISTS idx_classes_teacher;
CREATE INDEX IF NOT EXISTS idx_schools_teacher ON public.schools(teacher_user_id);

DROP INDEX IF EXISTS idx_class_members_student;
CREATE INDEX IF NOT EXISTS idx_school_members_student ON public.school_members(student_user_id);

DROP INDEX IF EXISTS idx_class_teachers_teacher;
CREATE INDEX IF NOT EXISTS idx_school_teachers_teacher ON public.school_teachers(teacher_user_id, school_id);

DROP INDEX IF EXISTS idx_assignments_class;
CREATE INDEX IF NOT EXISTS idx_assignments_school ON public.assignments(school_id);

-- Step 5: Update can_access_student function to use new table names
CREATE OR REPLACE FUNCTION public.can_access_student(student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_members sm
    JOIN public.schools s ON s.id = sm.school_id
    LEFT JOIN public.school_teachers st ON st.school_id = s.id
    WHERE sm.student_user_id = student
      AND (s.teacher_user_id = auth.uid() OR st.teacher_user_id = auth.uid())
  );
$$;

-- Step 6: Recreate RLS policies with updated table/column names

-- profiles policy: drop old version (table was classes/class_members in the query)
DROP POLICY IF EXISTS "profiles_read_self_teacher_admin" ON public.profiles;
CREATE POLICY "profiles_read_self_teacher_admin"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_admin()
  OR (
    public.is_teacher()
    AND EXISTS (
      SELECT 1
      FROM public.school_members sm
      JOIN public.schools s ON s.id = sm.school_id
      LEFT JOIN public.school_teachers st ON st.school_id = s.id
      WHERE sm.student_user_id = profiles.id
        AND (s.teacher_user_id = auth.uid() OR st.teacher_user_id = auth.uid())
    )
  )
);

-- schools policies (old policies were named for 'classes' table, now renamed to 'schools')
DROP POLICY IF EXISTS "classes_read_members_teacher_admin" ON public.schools;
DROP POLICY IF EXISTS "classes_write_teacher_admin" ON public.schools;
DROP POLICY IF EXISTS "schools_read_members_teacher_admin" ON public.schools;
DROP POLICY IF EXISTS "schools_write_teacher_admin" ON public.schools;

CREATE POLICY "schools_read_members_teacher_admin"
ON public.schools
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR teacher_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.school_teachers st
    WHERE st.school_id = schools.id AND st.teacher_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.school_members sm
    WHERE sm.school_id = schools.id AND sm.student_user_id = auth.uid()
  )
);

CREATE POLICY "schools_write_teacher_admin"
ON public.schools
FOR ALL
TO authenticated
USING (public.is_admin() OR teacher_user_id = auth.uid())
WITH CHECK (public.is_admin() OR teacher_user_id = auth.uid());

-- school_members policies
DROP POLICY IF EXISTS "class_members_read_scoped" ON public.school_members;
DROP POLICY IF EXISTS "class_members_write_teacher_admin" ON public.school_members;
DROP POLICY IF EXISTS "school_members_read_scoped" ON public.school_members;
DROP POLICY IF EXISTS "school_members_write_teacher_admin" ON public.school_members;

CREATE POLICY "school_members_read_scoped"
ON public.school_members
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR student_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = school_members.school_id
      AND s.teacher_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.school_teachers st
    WHERE st.school_id = school_members.school_id
      AND st.teacher_user_id = auth.uid()
  )
);

CREATE POLICY "school_members_write_teacher_admin"
ON public.school_members
FOR ALL
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = school_members.school_id
      AND s.teacher_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.school_teachers st
    WHERE st.school_id = school_members.school_id
      AND st.teacher_user_id = auth.uid()
  )
)
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = school_members.school_id
      AND s.teacher_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.school_teachers st
    WHERE st.school_id = school_members.school_id
      AND st.teacher_user_id = auth.uid()
  )
);

-- school_teachers policies
DROP POLICY IF EXISTS "class_teachers_read_scoped" ON public.school_teachers;
DROP POLICY IF EXISTS "class_teachers_write_teacher_admin" ON public.school_teachers;
DROP POLICY IF EXISTS "school_teachers_read_scoped" ON public.school_teachers;
DROP POLICY IF EXISTS "school_teachers_write_teacher_admin" ON public.school_teachers;

CREATE POLICY "school_teachers_read_scoped"
ON public.school_teachers
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR teacher_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.school_members sm
    WHERE sm.school_id = school_teachers.school_id
      AND sm.student_user_id = auth.uid()
  )
);

CREATE POLICY "school_teachers_write_teacher_admin"
ON public.school_teachers
FOR ALL
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.school_teachers st
    WHERE st.school_id = school_teachers.school_id
      AND st.teacher_user_id = auth.uid()
  )
)
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.school_teachers st
    WHERE st.school_id = school_teachers.school_id
      AND st.teacher_user_id = auth.uid()
  )
);

-- Step 7: Update analytics views
DROP VIEW IF EXISTS public.teacher_dashboard_standard_metrics;
CREATE OR REPLACE VIEW public.teacher_dashboard_standard_metrics AS
SELECT
  s.teacher_user_id,
  a.user_id AS student_user_id,
  a.standard_id,
  MAX(a.standard_label) AS standard_label,
  COUNT(*) AS attempted,
  COUNT(*) FILTER (WHERE a.is_correct) AS correct,
  ROUND(
    CASE WHEN COUNT(*) = 0 THEN 0
    ELSE (COUNT(*) FILTER (WHERE a.is_correct)::numeric / COUNT(*)::numeric) * 100
    END
  )::int AS accuracy,
  ROUND(AVG(COALESCE(a.time_spent_sec, 0)))::int AS average_time_sec
FROM public.attempts a
JOIN public.school_members sm ON sm.student_user_id = a.user_id
JOIN public.schools s ON s.id = sm.school_id
GROUP BY s.teacher_user_id, a.user_id, a.standard_id;

DROP VIEW IF EXISTS public.teacher_dashboard_student_metrics;
CREATE OR REPLACE VIEW public.teacher_dashboard_student_metrics AS
SELECT
  s.teacher_user_id,
  a.user_id AS student_user_id,
  COUNT(*) AS total_answered,
  COUNT(*) FILTER (WHERE a.is_correct) AS total_correct,
  ROUND(
    CASE WHEN COUNT(*) = 0 THEN 0
    ELSE (COUNT(*) FILTER (WHERE a.is_correct)::numeric / COUNT(*)::numeric) * 100
    END
  )::int AS accuracy
FROM public.attempts a
JOIN public.school_members sm ON sm.student_user_id = a.user_id
JOIN public.schools s ON s.id = sm.school_id
GROUP BY s.teacher_user_id, a.user_id;
