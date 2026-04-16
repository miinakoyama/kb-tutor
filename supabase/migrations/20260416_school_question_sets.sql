-- Links generated question sets to schools and controls Self Practice visibility per school.

create table if not exists public.school_question_sets (
  school_id text not null references public.schools(id) on delete cascade,
  set_id text not null references public.generated_question_sets(id) on delete cascade,
  available_for_self_practice boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (school_id, set_id)
);

create index if not exists idx_school_question_sets_school
  on public.school_question_sets(school_id);
create index if not exists idx_school_question_sets_set
  on public.school_question_sets(set_id);

alter table public.school_question_sets enable row level security;

-- Read: admin, teacher assigned to school, or student member of school
drop policy if exists "school_question_sets_select_scoped" on public.school_question_sets;
create policy "school_question_sets_select_scoped"
on public.school_question_sets
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.schools s
    where s.id = school_question_sets.school_id and s.teacher_user_id = auth.uid()
  )
  or exists (
    select 1 from public.school_teachers st
    where st.school_id = school_question_sets.school_id
      and st.teacher_user_id = auth.uid()
  )
  or exists (
    select 1 from public.school_members sm
    where sm.school_id = school_question_sets.school_id
      and sm.student_user_id = auth.uid()
  )
);

-- Write: admin or teacher on school_teachers for this school
drop policy if exists "school_question_sets_write_teacher_admin" on public.school_question_sets;
create policy "school_question_sets_write_teacher_admin"
on public.school_question_sets
for insert
to authenticated
with check (
  public.is_admin()
  or exists (
    select 1 from public.schools s
    where s.id = school_question_sets.school_id and s.teacher_user_id = auth.uid()
  )
  or exists (
    select 1 from public.school_teachers st
    where st.school_id = school_question_sets.school_id
      and st.teacher_user_id = auth.uid()
  )
);

drop policy if exists "school_question_sets_update_teacher_admin" on public.school_question_sets;
create policy "school_question_sets_update_teacher_admin"
on public.school_question_sets
for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.schools s
    where s.id = school_question_sets.school_id and s.teacher_user_id = auth.uid()
  )
  or exists (
    select 1 from public.school_teachers st
    where st.school_id = school_question_sets.school_id
      and st.teacher_user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.schools s
    where s.id = school_question_sets.school_id and s.teacher_user_id = auth.uid()
  )
  or exists (
    select 1 from public.school_teachers st
    where st.school_id = school_question_sets.school_id
      and st.teacher_user_id = auth.uid()
  )
);

drop policy if exists "school_question_sets_delete_teacher_admin" on public.school_question_sets;
create policy "school_question_sets_delete_teacher_admin"
on public.school_question_sets
for delete
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.schools s
    where s.id = school_question_sets.school_id and s.teacher_user_id = auth.uid()
  )
  or exists (
    select 1 from public.school_teachers st
    where st.school_id = school_question_sets.school_id
      and st.teacher_user_id = auth.uid()
  )
);

-- Teachers can read question sets linked to schools they teach (peer sets)
drop policy if exists "generated_question_sets_select_via_school" on public.generated_question_sets;
create policy "generated_question_sets_select_via_school"
on public.generated_question_sets
for select
to authenticated
using (
  exists (
    select 1 from public.school_question_sets sqs
    join public.schools s on s.id = sqs.school_id
    where sqs.set_id = generated_question_sets.id
      and (
        s.teacher_user_id = auth.uid()
        or exists (
          select 1 from public.school_teachers st
          where st.school_id = sqs.school_id and st.teacher_user_id = auth.uid()
        )
      )
  )
);

-- Students: read sets enabled for Self Practice at a school they attend
drop policy if exists "generated_question_sets_select_student_sp" on public.generated_question_sets;
create policy "generated_question_sets_select_student_sp"
on public.generated_question_sets
for select
to authenticated
using (
  exists (
    select 1 from public.school_question_sets sqs
    join public.school_members sm
      on sm.school_id = sqs.school_id and sm.student_user_id = auth.uid()
    where sqs.set_id = generated_question_sets.id
      and sqs.available_for_self_practice = true
  )
);

-- Teachers: read question rows for any set linked to a school they teach
drop policy if exists "generated_questions_select_via_school_teacher" on public.generated_questions;
create policy "generated_questions_select_via_school_teacher"
on public.generated_questions
for select
to authenticated
using (
  exists (
    select 1 from public.school_question_sets sqs
    join public.schools s on s.id = sqs.school_id
    where sqs.set_id = generated_questions.set_id
      and (
        s.teacher_user_id = auth.uid()
        or exists (
          select 1 from public.school_teachers st
          where st.school_id = sqs.school_id and st.teacher_user_id = auth.uid()
        )
      )
  )
);

-- Students: read question rows for Self Practice–enabled sets
drop policy if exists "generated_questions_select_student_sp" on public.generated_questions;
create policy "generated_questions_select_student_sp"
on public.generated_questions
for select
to authenticated
using (
  exists (
    select 1 from public.school_question_sets sqs
    join public.school_members sm
      on sm.school_id = sqs.school_id and sm.student_user_id = auth.uid()
    where sqs.set_id = generated_questions.set_id
      and sqs.available_for_self_practice = true
  )
);
