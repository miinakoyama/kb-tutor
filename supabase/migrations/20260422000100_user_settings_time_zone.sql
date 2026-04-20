-- Ensure user_settings.time_zone exists. The production baseline
-- (20260417145656_20260417000100_baseline_from_prod.sql) was dumped before
-- the legacy migration migrations_legacy/20260415_add_user_settings_time_zone.sql
-- was actually applied, so fresh environments created from the new baseline
-- are missing this column. Re-apply it idempotently so both local and prod
-- converge to the same schema.
ALTER TABLE "public"."user_settings"
  ADD COLUMN IF NOT EXISTS "time_zone" text;

COMMENT ON COLUMN "public"."user_settings"."time_zone" IS
  'IANA time zone, e.g. America/New_York';
