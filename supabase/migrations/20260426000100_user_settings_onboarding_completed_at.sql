alter table public.user_settings
add column if not exists onboarding_completed_at timestamptz;

comment on column public.user_settings.onboarding_completed_at is
  'Timestamp when first-login onboarding tour was completed.';
