-- Keep only one auth.users -> profiles trigger implementation.
-- The newer trg_auth_user_created / handle_auth_user_created pair is the canonical one.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
