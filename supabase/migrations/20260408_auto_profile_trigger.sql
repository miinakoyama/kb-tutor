-- Auto-create profile row when a new auth user is created
-- This ensures accounts created via Supabase dashboard also get a profile

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (
    new.id,
    new.email,
    COALESCE((new.raw_user_meta_data->>'role')::public.app_role, 'student')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Bootstrap: create profile rows for any existing auth users who don't have one
-- Admins are set to 'admin', everyone else defaults to 'student'
INSERT INTO public.profiles (id, email, role)
SELECT
  u.id,
  u.email,
  COALESCE(
    (u.raw_user_meta_data->>'role')::public.app_role,
    'student'
  )
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
  AND u.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;
