-- Replace the partial unique index on attempts.client_attempt_id with a plain
-- unique index.
--
-- Why: PostgREST's `on_conflict=client_attempt_id` cannot specify an index
-- predicate, so a partial unique index (`WHERE client_attempt_id IS NOT NULL`)
-- fails to match and Postgres raises 42P10.
-- A plain UNIQUE index allows multiple NULLs (standard SQL semantics) so legacy
-- rows without the column still coexist, and new rows remain idempotent.

DROP INDEX IF EXISTS public.attempts_client_attempt_id_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS attempts_client_attempt_id_uniq
  ON public.attempts (client_attempt_id);
