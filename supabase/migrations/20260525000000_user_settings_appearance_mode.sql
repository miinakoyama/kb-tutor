ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS appearance_mode text NOT NULL DEFAULT 'system'
  CHECK (appearance_mode IN ('system', 'light', 'dark'));

COMMENT ON COLUMN public.user_settings.appearance_mode IS
  'User appearance preference: system (follow OS), light, or dark.';
