-- Track the last time a student viewed the notifications page so we can
-- derive read/unread state without storing a row per notification.
ALTER TABLE "public"."user_settings"
  ADD COLUMN IF NOT EXISTS "notifications_last_read_at" timestamptz;
