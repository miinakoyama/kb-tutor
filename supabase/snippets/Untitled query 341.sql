insert into public.schools (id, name)
values ('demo-school', 'Demo School')
on conflict (id) do nothing;
