-- Break RLS cycles: schools <-> school_members <-> schools when policies use
-- EXISTS (SELECT ... FROM schools) from other tables (e.g. school_question_sets).
-- SECURITY DEFINER helpers read schools / school_members / school_teachers without RLS.

CREATE OR REPLACE FUNCTION public.can_access_school_question_set_row(p_school_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = p_school_id AND s.teacher_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.school_teachers st
    WHERE st.school_id = p_school_id AND st.teacher_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.school_members sm
    WHERE sm.school_id = p_school_id AND sm.student_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_school_question_sets_for_school(p_school_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = p_school_id AND s.teacher_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.school_teachers st
    WHERE st.school_id = p_school_id AND st.teacher_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.student_is_member_of_school(p_school_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_members sm
    WHERE sm.school_id = p_school_id AND sm.student_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_school_question_set_row(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_school_question_sets_for_school(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_is_member_of_school(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_school_question_set_row(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_school_question_sets_for_school(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_is_member_of_school(text) TO authenticated;

-- school_question_sets: replace inline EXISTS (schools / st / sm)
DROP POLICY IF EXISTS "school_question_sets_select_scoped" ON public.school_question_sets;
CREATE POLICY "school_question_sets_select_scoped"
ON public.school_question_sets
FOR SELECT
TO authenticated
USING (public.can_access_school_question_set_row(school_id));

DROP POLICY IF EXISTS "school_question_sets_write_teacher_admin" ON public.school_question_sets;
CREATE POLICY "school_question_sets_write_teacher_admin"
ON public.school_question_sets
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_school_question_sets_for_school(school_id));

DROP POLICY IF EXISTS "school_question_sets_update_teacher_admin" ON public.school_question_sets;
CREATE POLICY "school_question_sets_update_teacher_admin"
ON public.school_question_sets
FOR UPDATE
TO authenticated
USING (public.can_manage_school_question_sets_for_school(school_id))
WITH CHECK (public.can_manage_school_question_sets_for_school(school_id));

DROP POLICY IF EXISTS "school_question_sets_delete_teacher_admin" ON public.school_question_sets;
CREATE POLICY "school_question_sets_delete_teacher_admin"
ON public.school_question_sets
FOR DELETE
TO authenticated
USING (public.can_manage_school_question_sets_for_school(school_id));

-- generated_question_sets: remove joins to schools / raw school_members (RLS recursion)
DROP POLICY IF EXISTS "generated_question_sets_select_via_school" ON public.generated_question_sets;
CREATE POLICY "generated_question_sets_select_via_school"
ON public.generated_question_sets
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.school_question_sets sqs
    WHERE sqs.set_id = generated_question_sets.id
      AND public.can_manage_school_question_sets_for_school(sqs.school_id)
  )
);

DROP POLICY IF EXISTS "generated_question_sets_select_student_sp" ON public.generated_question_sets;
CREATE POLICY "generated_question_sets_select_student_sp"
ON public.generated_question_sets
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.school_question_sets sqs
    WHERE sqs.set_id = generated_question_sets.id
      AND sqs.available_for_self_practice = true
      AND public.student_is_member_of_school(sqs.school_id)
  )
);

-- generated_questions
DROP POLICY IF EXISTS "generated_questions_select_via_school_teacher" ON public.generated_questions;
CREATE POLICY "generated_questions_select_via_school_teacher"
ON public.generated_questions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.school_question_sets sqs
    WHERE sqs.set_id = generated_questions.set_id
      AND public.can_manage_school_question_sets_for_school(sqs.school_id)
  )
);

DROP POLICY IF EXISTS "generated_questions_select_student_sp" ON public.generated_questions;
CREATE POLICY "generated_questions_select_student_sp"
ON public.generated_questions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.school_question_sets sqs
    WHERE sqs.set_id = generated_questions.set_id
      AND sqs.available_for_self_practice = true
      AND public.student_is_member_of_school(sqs.school_id)
  )
);
