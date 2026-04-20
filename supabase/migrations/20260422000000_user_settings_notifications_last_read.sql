-- Track the last time a student viewed the notifications page so we can
-- derive read/unread state without storing a row per notification.
-- NULL means the student has never opened /notifications, in which case
-- the app treats every notification as unread — which is the desired
-- default for fresh accounts.
ALTER TABLE "public"."user_settings"
  ADD COLUMN IF NOT EXISTS "notifications_last_read_at" timestamptz;
