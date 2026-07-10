-- Short-answer attempts are graded server-side and must not be forgeable by
-- browser clients. Keep authenticated reads scoped by RLS, but remove direct
-- authenticated inserts; /api/short-answer/grade writes with the service role.

REVOKE INSERT ON TABLE "public"."short_answer_attempts" FROM authenticated;

DROP POLICY IF EXISTS "short_answer_attempts_insert_own"
  ON "public"."short_answer_attempts";
