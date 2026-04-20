-- Atomic toggle for include_in_self_practice (avoids read/modify/write races).

CREATE OR REPLACE FUNCTION public.toggle_generated_question_include_sp(
  p_set_id text,
  p_question_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_next boolean;
BEGIN
  UPDATE public.generated_questions
  SET include_in_self_practice = NOT COALESCE(include_in_self_practice, false)
  WHERE set_id = p_set_id AND id = p_question_id
  RETURNING include_in_self_practice INTO v_next;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_generated_question_include_sp(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_generated_question_include_sp(text, text) TO authenticated;
