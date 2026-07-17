-- Assignment exams save draft option selections for resume. Only the answer
-- finalized at exam submission is valid BKT evidence.

ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS is_finalized boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.bkt_attempt_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_finalized AND NEW.selected_option_id <> 'short-answer' THEN
    PERFORM public.apply_bkt_observation('mcq_attempt', NEW.id, 1::smallint);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attempts_apply_bkt ON public.attempts;
CREATE TRIGGER attempts_apply_bkt
AFTER INSERT OR UPDATE OF is_correct, answered_at, is_finalized
ON public.attempts
FOR EACH ROW EXECUTE FUNCTION public.bkt_attempt_trigger();

REVOKE ALL ON FUNCTION public.bkt_attempt_trigger()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bkt_attempt_trigger() TO service_role;
