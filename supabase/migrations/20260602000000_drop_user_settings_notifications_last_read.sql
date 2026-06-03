-- Notifications feature removed; drop the unused read-tracking column.
ALTER TABLE "public"."user_settings"
  DROP COLUMN IF EXISTS "notifications_last_read_at";
