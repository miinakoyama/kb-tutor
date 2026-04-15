alter table public.user_settings
add column if not exists time_zone text;

comment on column public.user_settings.time_zone is
'IANA time zone, e.g. America/New_York';
