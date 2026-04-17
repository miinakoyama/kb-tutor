-- Ensure every auth user has a matching profile row.
-- This prevents role/UI fallbacks (e.g. sidebar stuck as student/loading).

create or replace function public.resolve_app_role(raw_role text)
returns public.app_role
language plpgsql
immutable
as $$
begin
  if raw_role = 'admin' then
    return 'admin';
  elsif raw_role = 'teacher' then
    return 'teacher';
  else
    return 'student';
  end if;
end;
$$;

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inferred_role public.app_role;
  inferred_student_id text;
  inferred_display_name text;
begin
  inferred_role := public.resolve_app_role(
    coalesce(new.raw_user_meta_data->>'role', new.raw_app_meta_data->>'role')
  );
  inferred_student_id := nullif(new.raw_user_meta_data->>'student_id', '');
  inferred_display_name := nullif(new.raw_user_meta_data->>'display_name', '');

  insert into public.profiles (
    id,
    email,
    student_id,
    display_name,
    role
  ) values (
    new.id,
    coalesce(new.email, new.id::text || '@student.local'),
    inferred_student_id,
    inferred_display_name,
    inferred_role
  )
  on conflict (id) do update set
    email = excluded.email,
    student_id = coalesce(public.profiles.student_id, excluded.student_id),
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    role = public.profiles.role;

  return new;
end;
$$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
after insert on auth.users
for each row execute function public.handle_auth_user_created();

-- Backfill existing users missing profile rows.
insert into public.profiles (id, email, student_id, display_name, role)
select
  u.id,
  coalesce(u.email, u.id::text || '@student.local') as email,
  nullif(u.raw_user_meta_data->>'student_id', '') as student_id,
  nullif(u.raw_user_meta_data->>'display_name', '') as display_name,
  public.resolve_app_role(
    coalesce(u.raw_user_meta_data->>'role', u.raw_app_meta_data->>'role')
  ) as role
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
