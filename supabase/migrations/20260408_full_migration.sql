-- Full migration baseline for kb-tutor
-- student / teacher / admin roles with strict RLS

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('student', 'teacher', 'admin');
  end if;
end$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  student_id text unique,
  display_name text,
  role public.app_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_student_or_email check (
    student_id is not null or email is not null
  )
);

create table if not exists public.classes (
  id text primary key,
  name text not null,
  grade smallint,
  teacher_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.class_members (
  class_id text not null references public.classes(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, student_user_id)
);

create table if not exists public.assignments (
  id text primary key,
  title text not null,
  class_id text not null references public.classes(id) on delete cascade,
  due_date timestamptz,
  module_ids int[] not null default '{}',
  topics text[] not null default '{}',
  target_minutes int not null default 20,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.assignment_targets (
  assignment_id text not null references public.assignments(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (assignment_id, student_user_id)
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  assignment_id text references public.assignments(id) on delete set null,
  question_id text not null,
  selected_option_id text not null,
  is_correct boolean not null,
  mode text not null,
  module int,
  topic text,
  standard_id text,
  standard_label text,
  time_spent_sec int,
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.bookmarks (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  question_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table if not exists public.generated_question_sets (
  id text primary key,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null,
  generated_at timestamptz not null,
  generation_model_id text,
  generation_model_label text,
  created_at timestamptz not null default now()
);

create table if not exists public.generated_questions (
  id text not null,
  set_id text not null references public.generated_question_sets(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  payload jsonb not null,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (set_id, id)
);

create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  tts_rate numeric(3,2),
  auto_read_question boolean,
  auto_read_choices boolean,
  auto_read_feedback boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_generated_questions_updated_at on public.generated_questions;
create trigger trg_generated_questions_updated_at
before update on public.generated_questions
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_user_settings_updated_at on public.user_settings;
create trigger trg_user_settings_updated_at
before update on public.user_settings
for each row execute procedure public.set_updated_at();

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_classes_teacher on public.classes(teacher_user_id);
create index if not exists idx_class_members_student on public.class_members(student_user_id);
create index if not exists idx_assignments_class on public.assignments(class_id);
create index if not exists idx_assignment_targets_student on public.assignment_targets(student_user_id);
create index if not exists idx_attempts_user_answered_at on public.attempts(user_id, answered_at desc);
create index if not exists idx_attempts_standard on public.attempts(standard_id);
create index if not exists idx_attempts_assignment on public.attempts(assignment_id);
create index if not exists idx_bookmarks_user on public.bookmarks(user_id);
create index if not exists idx_generated_sets_user on public.generated_question_sets(user_id, generated_at desc);
create index if not exists idx_generated_questions_user on public.generated_questions(user_id, set_id);

-- SECURITY DEFINER is required to avoid infinite RLS recursion:
-- the profiles RLS policy calls is_admin() which queries profiles,
-- which would trigger the policy again without SECURITY DEFINER.
create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'admin', false);
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'teacher', false);
$$;

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
    where cm.student_user_id = student
      and c.teacher_user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_targets enable row level security;
alter table public.attempts enable row level security;
alter table public.bookmarks enable row level security;
alter table public.generated_question_sets enable row level security;
alter table public.generated_questions enable row level security;
alter table public.user_settings enable row level security;

-- profiles
drop policy if exists "profiles_read_self_teacher_admin" on public.profiles;
create policy "profiles_read_self_teacher_admin"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (
    public.is_teacher()
    and exists (
      select 1
      from public.class_members cm
      join public.classes c on c.id = cm.class_id
      where cm.student_user_id = profiles.id
        and c.teacher_user_id = auth.uid()
    )
  )
);

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

-- classes
drop policy if exists "classes_read_members_teacher_admin" on public.classes;
create policy "classes_read_members_teacher_admin"
on public.classes
for select
to authenticated
using (
  public.is_admin()
  or teacher_user_id = auth.uid()
  or exists (
    select 1 from public.class_members cm
    where cm.class_id = classes.id and cm.student_user_id = auth.uid()
  )
);

drop policy if exists "classes_write_teacher_admin" on public.classes;
create policy "classes_write_teacher_admin"
on public.classes
for all
to authenticated
using (public.is_admin() or teacher_user_id = auth.uid())
with check (public.is_admin() or teacher_user_id = auth.uid());

-- class_members
drop policy if exists "class_members_read_scoped" on public.class_members;
create policy "class_members_read_scoped"
on public.class_members
for select
to authenticated
using (
  public.is_admin()
  or student_user_id = auth.uid()
  or exists (
    select 1 from public.classes c
    where c.id = class_members.class_id
      and c.teacher_user_id = auth.uid()
  )
);

drop policy if exists "class_members_write_teacher_admin" on public.class_members;
create policy "class_members_write_teacher_admin"
on public.class_members
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.classes c
    where c.id = class_members.class_id
      and c.teacher_user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.classes c
    where c.id = class_members.class_id
      and c.teacher_user_id = auth.uid()
  )
);

-- assignments
drop policy if exists "assignments_read_scoped" on public.assignments;
create policy "assignments_read_scoped"
on public.assignments
for select
to authenticated
using (
  public.is_admin()
  or created_by = auth.uid()
  or exists (
    select 1
    from public.assignment_targets at
    where at.assignment_id = assignments.id
      and at.student_user_id = auth.uid()
  )
);

drop policy if exists "assignments_write_teacher_admin" on public.assignments;
create policy "assignments_write_teacher_admin"
on public.assignments
for all
to authenticated
using (public.is_admin() or created_by = auth.uid())
with check (public.is_admin() or created_by = auth.uid());

-- assignment targets
drop policy if exists "assignment_targets_read_scoped" on public.assignment_targets;
create policy "assignment_targets_read_scoped"
on public.assignment_targets
for select
to authenticated
using (
  public.is_admin()
  or student_user_id = auth.uid()
  or exists (
    select 1
    from public.assignments a
    where a.id = assignment_targets.assignment_id
      and a.created_by = auth.uid()
  )
);

drop policy if exists "assignment_targets_write_teacher_admin" on public.assignment_targets;
create policy "assignment_targets_write_teacher_admin"
on public.assignment_targets
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.assignments a
    where a.id = assignment_targets.assignment_id
      and a.created_by = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.assignments a
    where a.id = assignment_targets.assignment_id
      and a.created_by = auth.uid()
  )
);

-- attempts
drop policy if exists "attempts_read_scoped" on public.attempts;
create policy "attempts_read_scoped"
on public.attempts
for select
to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or (
    public.is_teacher() and public.can_access_student(user_id)
  )
);

drop policy if exists "attempts_insert_self_teacher_admin" on public.attempts;
create policy "attempts_insert_self_teacher_admin"
on public.attempts
for insert
to authenticated
with check (
  public.is_admin()
  or user_id = auth.uid()
  or (public.is_teacher() and public.can_access_student(user_id))
);

drop policy if exists "attempts_update_admin_only" on public.attempts;
create policy "attempts_update_admin_only"
on public.attempts
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- bookmarks
drop policy if exists "bookmarks_self_all" on public.bookmarks;
create policy "bookmarks_self_all"
on public.bookmarks
for all
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

-- generated sets
drop policy if exists "generated_sets_self_all" on public.generated_question_sets;
create policy "generated_sets_self_all"
on public.generated_question_sets
for all
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

-- generated questions
drop policy if exists "generated_questions_self_all" on public.generated_questions;
create policy "generated_questions_self_all"
on public.generated_questions
for all
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

-- user settings
drop policy if exists "user_settings_self_all" on public.user_settings;
create policy "user_settings_self_all"
on public.user_settings
for all
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create or replace view public.teacher_dashboard_standard_metrics as
select
  c.teacher_user_id,
  a.user_id as student_user_id,
  a.standard_id,
  max(a.standard_label) as standard_label,
  count(*) as attempted,
  count(*) filter (where a.is_correct) as correct,
  round(
    case when count(*) = 0 then 0
    else (count(*) filter (where a.is_correct)::numeric / count(*)::numeric) * 100
    end
  )::int as accuracy,
  round(avg(coalesce(a.time_spent_sec, 0)))::int as average_time_sec
from public.attempts a
join public.class_members cm on cm.student_user_id = a.user_id
join public.classes c on c.id = cm.class_id
group by c.teacher_user_id, a.user_id, a.standard_id;

create or replace view public.teacher_dashboard_student_metrics as
select
  c.teacher_user_id,
  a.user_id as student_user_id,
  count(*) as total_answered,
  count(*) filter (where a.is_correct) as total_correct,
  round(
    case when count(*) = 0 then 0
    else (count(*) filter (where a.is_correct)::numeric / count(*)::numeric) * 100
    end
  )::int as accuracy
from public.attempts a
join public.class_members cm on cm.student_user_id = a.user_id
join public.classes c on c.id = cm.class_id
group by c.teacher_user_id, a.user_id;
