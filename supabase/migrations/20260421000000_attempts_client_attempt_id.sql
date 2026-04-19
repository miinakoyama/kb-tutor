-- Add an idempotency key to `attempts` so client-side retries don't create
-- duplicate rows when a network blip causes a retry after a silent success.
--
-- The client generates a UUID per attempt submit. Retries reuse the same UUID,
-- so `INSERT ... ON CONFLICT (client_attempt_id) DO NOTHING` is safe.

ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS client_attempt_id uuid;

-- Partial unique index: legacy rows (NULL) remain unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS attempts_client_attempt_id_uniq
  ON public.attempts (client_attempt_id)
  WHERE client_attempt_id IS NOT NULL;
