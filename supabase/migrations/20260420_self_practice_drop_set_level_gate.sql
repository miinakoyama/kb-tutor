-- Self Practice exposure is controlled per question (include_in_self_practice).
-- School–set links only mean the set is associated with the school; no second gate on the link.

DROP POLICY IF EXISTS "generated_question_sets_select_student_sp" ON public.generated_question_sets;
CREATE POLICY "generated_question_sets_select_student_sp"
ON public.generated_question_sets
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.school_question_sets sqs
    WHERE sqs.set_id = generated_question_sets.id
      AND public.student_is_member_of_school(sqs.school_id)
  )
);

DROP POLICY IF EXISTS "generated_questions_select_student_sp" ON public.generated_questions;
CREATE POLICY "generated_questions_select_student_sp"
ON public.generated_questions
FOR SELECT
TO authenticated
USING (
  generated_questions.include_in_self_practice = true
  AND EXISTS (
    SELECT 1 FROM public.school_question_sets sqs
    WHERE sqs.set_id = generated_questions.set_id
      AND public.student_is_member_of_school(sqs.school_id)
  )
);
