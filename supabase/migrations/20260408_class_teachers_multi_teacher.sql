create table if not exists public.class_teachers (
  class_id text not null references public.classes(id) on delete cascade,
  teacher_user_id uuid not null references public.profiles(id) on delete cascade,
  teacher_role text not null default 'primary' check (teacher_role in ('primary', 'assistant')),
  created_at timestamptz not null default now(),
  primary key (class_id, teacher_user_id)
);

create index if not exists idx_class_teachers_teacher
  on public.class_teachers(teacher_user_id, class_id);

insert into public.class_teachers (class_id, teacher_user_id, teacher_role)
select id, teacher_user_id, 'primary'
from public.classes
where teacher_user_id is not null
on conflict (class_id, teacher_user_id) do nothing;

alter table public.class_teachers enable row level security;

drop policy if exists "class_teachers_read_scoped" on public.class_teachers;
create policy "class_teachers_read_scoped"
on public.class_teachers
for select
to authenticated
using (
  public.is_admin()
  or teacher_user_id = auth.uid()
  or exists (
    select 1
    from public.class_members cm
    where cm.class_id = class_teachers.class_id
      and cm.student_user_id = auth.uid()
  )
);

drop policy if exists "class_teachers_write_teacher_admin" on public.class_teachers;
create policy "class_teachers_write_teacher_admin"
on public.class_teachers
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.class_teachers ct
    where ct.class_id = class_teachers.class_id
      and ct.teacher_user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.class_teachers ct
    where ct.class_id = class_teachers.class_id
      and ct.teacher_user_id = auth.uid()
  )
);

create or replace function public.can_access_student(student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_members cm
    join public.classes c on c.id = cm.class_id
    left join public.class_teachers ct on ct.class_id = c.id
    where cm.student_user_id = student
      and (c.teacher_user_id = auth.uid() or ct.teacher_user_id = auth.uid())
  );
$$;
