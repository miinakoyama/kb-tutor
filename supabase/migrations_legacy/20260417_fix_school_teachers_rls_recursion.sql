-- Fix infinite recursion: school_teachers_write_teacher_admin used FOR ALL, so it applied
-- to SELECT. Its USING clause queried school_teachers again, re-entering RLS.
-- Question Manager reads school_question_sets whose policies join school_teachers,
-- triggering this cycle for teachers.

-- Helper: check school teacher access without RLS recursion (reads school_teachers as definer)
CREATE OR REPLACE FUNCTION public.can_write_school_teachers_for_school(p_school_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.schools s
    WHERE s.id = p_school_id
      AND s.teacher_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.school_teachers st
    WHERE st.school_id = p_school_id
      AND st.teacher_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.can_write_school_teachers_for_school(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_school_teachers_for_school(text) TO authenticated;

DROP POLICY IF EXISTS "school_teachers_write_teacher_admin" ON public.school_teachers;

CREATE POLICY "school_teachers_insert_teacher_admin"
ON public.school_teachers
FOR INSERT
TO authenticated
WITH CHECK (public.can_write_school_teachers_for_school(school_id));

CREATE POLICY "school_teachers_update_teacher_admin"
ON public.school_teachers
FOR UPDATE
TO authenticated
USING (public.can_write_school_teachers_for_school(school_id))
WITH CHECK (public.can_write_school_teachers_for_school(school_id));

CREATE POLICY "school_teachers_delete_teacher_admin"
ON public.school_teachers
FOR DELETE
TO authenticated
USING (public.can_write_school_teachers_for_school(school_id));
