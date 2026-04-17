insert into public.schools (id, name, teacher_user_id)
select 'demo-school', 'Demo School', p.id
from public.profiles p
where p.email = 'teacher@example.com'
on conflict (id) do update
set teacher_user_id = excluded.teacher_user_id;

insert into public.school_teachers (school_id, teacher_user_id, teacher_role)
select 'demo-school', p.id, 'primary'
from public.profiles p
where p.email = 'teacher@example.com'
on conflict (school_id, teacher_user_id) do nothing;
