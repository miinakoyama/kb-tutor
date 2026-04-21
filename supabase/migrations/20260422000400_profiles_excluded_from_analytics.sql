-- Add a flag to exclude specific users (e.g. developer test accounts) from analytics.
-- When true, the user's attempts are omitted from teacher/admin dashboards and assignment
-- analytics aggregates. The profile itself (and their attempts) is kept unchanged.

ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "excluded_from_analytics" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "public"."profiles"."excluded_from_analytics" IS
  'When true, the user is excluded from analytics aggregates (teacher dashboard metrics, assignment response counts, etc.). Typically used for developer / internal test accounts.';

CREATE INDEX IF NOT EXISTS "idx_profiles_excluded_from_analytics"
  ON "public"."profiles" USING "btree" ("excluded_from_analytics")
  WHERE "excluded_from_analytics" = true;

-- Rebuild dashboard views to exclude flagged students.
CREATE OR REPLACE VIEW "public"."teacher_dashboard_standard_metrics" AS
 SELECT "s"."teacher_user_id",
    "a"."user_id" AS "student_user_id",
    "a"."standard_id",
    "max"("a"."standard_label") AS "standard_label",
    "count"(*) AS "attempted",
    "count"(*) FILTER (WHERE "a"."is_correct") AS "correct",
    ("round"(
        CASE
            WHEN ("count"(*) = 0) THEN (0)::numeric
            ELSE ((("count"(*) FILTER (WHERE "a"."is_correct"))::numeric / ("count"(*))::numeric) * (100)::numeric)
        END))::integer AS "accuracy",
    ("round"("avg"(COALESCE("a"."time_spent_sec", 0))))::integer AS "average_time_sec"
   FROM ((("public"."attempts" "a"
     JOIN "public"."school_members" "sm" ON (("sm"."student_user_id" = "a"."user_id")))
     JOIN "public"."schools" "s" ON (("s"."id" = "sm"."school_id")))
     JOIN "public"."profiles" "p" ON (("p"."id" = "a"."user_id")))
  WHERE (COALESCE("p"."excluded_from_analytics", false) = false)
  GROUP BY "s"."teacher_user_id", "a"."user_id", "a"."standard_id";


CREATE OR REPLACE VIEW "public"."teacher_dashboard_student_metrics" AS
 SELECT "s"."teacher_user_id",
    "a"."user_id" AS "student_user_id",
    "count"(*) AS "total_answered",
    "count"(*) FILTER (WHERE "a"."is_correct") AS "total_correct",
    ("round"(
        CASE
            WHEN ("count"(*) = 0) THEN (0)::numeric
            ELSE ((("count"(*) FILTER (WHERE "a"."is_correct"))::numeric / ("count"(*))::numeric) * (100)::numeric)
        END))::integer AS "accuracy"
   FROM ((("public"."attempts" "a"
     JOIN "public"."school_members" "sm" ON (("sm"."student_user_id" = "a"."user_id")))
     JOIN "public"."schools" "s" ON (("s"."id" = "sm"."school_id")))
     JOIN "public"."profiles" "p" ON (("p"."id" = "a"."user_id")))
  WHERE (COALESCE("p"."excluded_from_analytics", false) = false)
  GROUP BY "s"."teacher_user_id", "a"."user_id";
