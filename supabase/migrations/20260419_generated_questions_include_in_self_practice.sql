-- Per-question flag: include in Self Practice bank when the set is SP-enabled for the school.

alter table public.generated_questions
  add column if not exists include_in_self_practice boolean not null default false;

comment on column public.generated_questions.include_in_self_practice is
  'When true, students may see this row in Self Practice if the set is linked with available_for_self_practice.';

-- Student SELECT: require per-question opt-in (AND with existing school / SP link checks).
drop policy if exists "generated_questions_select_student_sp" on public.generated_questions;
create policy "generated_questions_select_student_sp"
on public.generated_questions
for select
to authenticated
using (
  generated_questions.include_in_self_practice = true
  and exists (
    select 1 from public.school_question_sets sqs
    where sqs.set_id = generated_questions.set_id
      and sqs.available_for_self_practice = true
      and public.student_is_member_of_school(sqs.school_id)
  )
);
