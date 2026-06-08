-- Ensure existing environments receive table privileges for the
-- teacher_performance_thresholds RLS policies. RLS still restricts
-- authenticated users to their own row.

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE "public"."teacher_performance_thresholds"
  TO authenticated;

GRANT ALL
  ON TABLE "public"."teacher_performance_thresholds"
  TO service_role;
