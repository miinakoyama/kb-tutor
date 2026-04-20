-- Fix infinite recursion between assignments and assignment_targets RLS policies.
-- Previous policies referenced each other via EXISTS subqueries.

-- assignment_targets: remove dependency on assignments table in read/write checks
DROP POLICY IF EXISTS "assignment_targets_read_scoped" ON public.assignment_targets;
CREATE POLICY "assignment_targets_read_scoped"
ON public.assignment_targets
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR student_user_id = auth.uid()
  OR public.can_access_student(student_user_id)
);

DROP POLICY IF EXISTS "assignment_targets_write_teacher_admin" ON public.assignment_targets;
CREATE POLICY "assignment_targets_write_teacher_admin"
ON public.assignment_targets
FOR ALL
TO authenticated
USING (
  public.is_admin()
  OR public.can_access_student(student_user_id)
)
WITH CHECK (
  public.is_admin()
  OR public.can_access_student(student_user_id)
);

-- assignments policy can continue to reference assignment_targets now that the
-- reverse dependency is removed.
DROP POLICY IF EXISTS "assignments_read_scoped" ON public.assignments;
CREATE POLICY "assignments_read_scoped"
ON public.assignments
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.assignment_targets at
    WHERE at.assignment_id = assignments.id
      AND at.student_user_id = auth.uid()
  )
);
