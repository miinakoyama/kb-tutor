ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS appearance_mode text NOT NULL DEFAULT 'system';

COMMENT ON COLUMN public.user_settings.appearance_mode IS
  'User appearance preference: system (follow OS), light, or dark.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_settings_appearance_mode_check'
      AND conrelid = 'public.user_settings'::regclass
  ) THEN
    ALTER TABLE public.user_settings
      ADD CONSTRAINT user_settings_appearance_mode_check
      CHECK (appearance_mode IN ('system', 'light', 'dark'));
  END IF;
END $$;
