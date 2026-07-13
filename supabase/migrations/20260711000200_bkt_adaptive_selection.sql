-- Persistent adaptive rotation and reproducible selection decisions.

CREATE TABLE IF NOT EXISTS public.adaptive_rotation_states (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  standard_id text NOT NULL,
  cycle_position smallint NOT NULL DEFAULT 0 CHECK (cycle_position BETWEEN 0 AND 2),
  recent_kc_codes text[] NOT NULL DEFAULT '{}',
  last_question_id text,
  last_served_at timestamptz,
  lock_version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, standard_id)
);

CREATE TABLE IF NOT EXISTS public.adaptive_selection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.analytics_sessions(id) ON DELETE SET NULL,
  standard_id text NOT NULL,
  lane text NOT NULL CHECK (lane IN ('first_pass', 'priority', 'rotation')),
  candidate_kc_codes text[] NOT NULL,
  target_kc_code text REFERENCES public.knowledge_components(code),
  fallback_kc_codes text[] NOT NULL DEFAULT '{}',
  question_set_id text,
  question_id text,
  question_format text CHECK (question_format IS NULL OR question_format IN ('mcq', 'saq')),
  outcome text NOT NULL CHECK (outcome IN ('selected', 'coverage_gap', 'complete', 'unavailable')),
  decision_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  rotation_version bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adaptive_selection_events_user_standard_idx
  ON public.adaptive_selection_events (user_id, standard_id, created_at DESC);
CREATE INDEX IF NOT EXISTS adaptive_selection_events_question_idx
  ON public.adaptive_selection_events (user_id, question_id, created_at DESC)
  WHERE question_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_adaptive_selection(
  p_user_id uuid,
  p_session_id uuid,
  p_standard_id text,
  p_lane text,
  p_candidate_kc_codes text[],
  p_target_kc_code text,
  p_fallback_kc_codes text[],
  p_question_set_id text,
  p_question_id text,
  p_question_format text,
  p_outcome text,
  p_decision_context jsonb,
  p_expected_version bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_state public.adaptive_rotation_states;
BEGIN
  INSERT INTO public.adaptive_rotation_states (user_id, standard_id)
  VALUES (p_user_id, p_standard_id) ON CONFLICT DO NOTHING;
  SELECT * INTO v_state FROM public.adaptive_rotation_states
  WHERE user_id = p_user_id AND standard_id = p_standard_id FOR UPDATE;
  IF v_state.lock_version <> p_expected_version THEN RETURN false; END IF;

  UPDATE public.adaptive_rotation_states SET
    cycle_position = CASE WHEN p_lane = 'first_pass' OR p_outcome <> 'selected'
      THEN cycle_position ELSE ((cycle_position + 1) % 3)::smallint END,
    recent_kc_codes = CASE WHEN p_outcome = 'selected'
      THEN (array_append(recent_kc_codes, p_target_kc_code))[GREATEST(1, array_length(recent_kc_codes, 1)):]
      ELSE recent_kc_codes END,
    last_question_id = CASE WHEN p_outcome = 'selected' THEN p_question_id ELSE last_question_id END,
    last_served_at = CASE WHEN p_outcome = 'selected' THEN now() ELSE last_served_at END,
    lock_version = lock_version + 1,
    updated_at = now()
  WHERE user_id = p_user_id AND standard_id = p_standard_id;

  -- Keep only the last two target KCs used for the consecutive-selection cap.
  UPDATE public.adaptive_rotation_states SET
    recent_kc_codes = recent_kc_codes[GREATEST(1, COALESCE(array_length(recent_kc_codes, 1), 0) - 1):]
  WHERE user_id = p_user_id AND standard_id = p_standard_id;

  INSERT INTO public.adaptive_selection_events (
    user_id, session_id, standard_id, lane, candidate_kc_codes, target_kc_code,
    fallback_kc_codes, question_set_id, question_id, question_format, outcome,
    decision_context, rotation_version
  ) VALUES (
    p_user_id, p_session_id, p_standard_id, p_lane, p_candidate_kc_codes, p_target_kc_code,
    COALESCE(p_fallback_kc_codes, '{}'), p_question_set_id, p_question_id, p_question_format,
    p_outcome, COALESCE(p_decision_context, '{}'::jsonb), p_expected_version + 1
  );
  RETURN true;
END;
$$;

ALTER TABLE public.adaptive_rotation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_selection_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY adaptive_rotation_states_own_read ON public.adaptive_rotation_states
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY adaptive_selection_events_scoped_read ON public.adaptive_selection_events
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR public.is_admin()
    OR (public.is_teacher() AND public.teacher_can_read_student_profile(user_id))
  );

REVOKE ALL ON public.adaptive_rotation_states, public.adaptive_selection_events FROM anon, authenticated;
GRANT SELECT ON public.adaptive_rotation_states, public.adaptive_selection_events TO authenticated;
GRANT ALL ON public.adaptive_rotation_states, public.adaptive_selection_events TO service_role;
REVOKE ALL ON FUNCTION public.record_adaptive_selection(
  uuid, uuid, text, text, text[], text, text[], text, text, text, text, jsonb, bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_adaptive_selection(
  uuid, uuid, text, text, text[], text, text[], text, text, text, text, jsonb, bigint
) TO service_role;
