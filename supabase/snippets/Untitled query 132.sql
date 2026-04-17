update public.profiles
set role = 'admin', display_name = 'Local Admin'
where email = 'admin@example.com';

update public.profiles
set role = 'teacher', display_name = 'Local Teacher'
where email = 'teacher@example.com';
