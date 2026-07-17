-- Preserve healthy enabled rollouts during revalidation and bind delayed
-- observations to the KC mapping that was effective when the answer occurred.

CREATE OR REPLACE FUNCTION public.validate_bkt_standard_rollout(
  p_standard_id text,
  p_actor uuid
)
RETURNS public.bkt_standard_rollouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.bkt_standard_rollouts;
  v_active integer;
  v_covered integer;
  v_eligible integer;
  v_unresolved integer;
  v_hash text;
  v_valid boolean;
BEGIN
  PERFORM public.bkt_assert_admin(p_actor);
  SELECT count(*)::integer INTO v_active
  FROM public.knowledge_components
  WHERE standard_id = p_standard_id AND active;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE coverage_state <> 'valid')::integer
    INTO v_eligible, v_unresolved
  FROM public.bkt_question_coverage
  WHERE standard_id = p_standard_id AND include_in_self_practice;

  SELECT count(DISTINCT assignment.kc_code)::integer INTO v_covered
  FROM public.question_kc_assignments assignment
  JOIN public.generated_questions question
    ON question.set_id = assignment.question_set_id
    AND question.id = assignment.question_id
  WHERE assignment.standard_id = p_standard_id
    AND assignment.valid_to IS NULL
    AND assignment.status = 'confirmed'
    AND question.include_in_self_practice;

  SELECT encode(extensions.digest(convert_to(
    concat_ws(
      '|',
      p_standard_id,
      v_active,
      v_covered,
      v_eligible,
      v_unresolved,
      COALESCE((
        SELECT string_agg(kc.code, ',' ORDER BY kc.catalog_order)
        FROM public.knowledge_components kc
        WHERE kc.standard_id = p_standard_id AND kc.active
      ), ''),
      COALESCE((
        SELECT string_agg(
          concat_ws(
            ':',
            coverage.question_set_id,
            coverage.question_id,
            coverage.current_content_hash,
            coverage.coverage_state,
            coverage.confirmed_kc_codes::text
          ),
          ',' ORDER BY coverage.question_set_id, coverage.question_id
        )
        FROM public.bkt_question_coverage coverage
        WHERE coverage.standard_id = p_standard_id
          AND coverage.include_in_self_practice
      ), '')
    ),
    'UTF8'
  ), 'sha256'), 'hex') INTO v_hash;

  v_valid := v_active > 0 AND v_active = v_covered AND v_unresolved = 0;

  INSERT INTO public.bkt_standard_rollouts (
    standard_id,
    status,
    coverage_hash,
    eligible_question_count,
    covered_kc_count,
    active_kc_count,
    unresolved_self_practice_count,
    validated_at,
    updated_at
  ) VALUES (
    p_standard_id,
    CASE WHEN v_valid THEN 'ready' ELSE 'disabled' END,
    v_hash,
    v_eligible,
    v_covered,
    v_active,
    v_unresolved,
    now(),
    now()
  ) ON CONFLICT (standard_id) DO UPDATE SET
    status = CASE
      WHEN public.bkt_standard_rollouts.status = 'enabled' AND v_valid
        THEN 'enabled'
      WHEN v_valid THEN 'ready'
      ELSE 'disabled'
    END,
    coverage_hash = EXCLUDED.coverage_hash,
    eligible_question_count = EXCLUDED.eligible_question_count,
    covered_kc_count = EXCLUDED.covered_kc_count,
    active_kc_count = EXCLUDED.active_kc_count,
    unresolved_self_practice_count = EXCLUDED.unresolved_self_practice_count,
    validated_at = now(),
    enabled_at = CASE
      WHEN public.bkt_standard_rollouts.status = 'enabled' AND v_valid
        THEN public.bkt_standard_rollouts.enabled_at
      ELSE NULL
    END,
    enabled_by = CASE
      WHEN public.bkt_standard_rollouts.status = 'enabled' AND v_valid
        THEN public.bkt_standard_rollouts.enabled_by
      ELSE NULL
    END,
    disabled_at = CASE
      WHEN NOT v_valid THEN now()
      ELSE public.bkt_standard_rollouts.disabled_at
    END,
    disable_reason = CASE
      WHEN v_valid THEN NULL
      ELSE 'Coverage validation failed'
    END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_bkt_standard_rollout(
  p_standard_id text,
  p_actor uuid,
  p_enabled boolean,
  p_reason text DEFAULT NULL
)
RETURNS public.bkt_standard_rollouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.bkt_standard_rollouts;
  v_status text;
  v_unresolved integer;
  v_covered integer;
  v_active integer;
BEGIN
  PERFORM public.bkt_assert_admin(p_actor);

  IF p_enabled THEN
    PERFORM public.validate_bkt_standard_rollout(p_standard_id, p_actor);
  END IF;

  SELECT
    rollout.status,
    rollout.unresolved_self_practice_count,
    rollout.covered_kc_count,
    rollout.active_kc_count
    INTO v_status, v_unresolved, v_covered, v_active
  FROM public.bkt_standard_rollouts rollout
  WHERE rollout.standard_id = p_standard_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Standard rollout has not been validated'
      USING ERRCODE = '23514';
  END IF;

  -- Re-enabling an already-enabled healthy rollout is idempotent. Validation
  -- now preserves `enabled`, so both healthy states must be accepted here.
  IF p_enabled AND (
    v_status NOT IN ('ready', 'enabled')
    OR v_unresolved <> 0
    OR v_covered <> v_active
  ) THEN
    RAISE EXCEPTION 'Standard coverage is not ready (status %, unresolved %, covered %, active %)',
      v_status, v_unresolved, v_covered, v_active
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.bkt_standard_rollouts
  SET
    status = CASE WHEN p_enabled THEN 'enabled' ELSE 'disabled' END,
    enabled_at = CASE
      WHEN p_enabled THEN COALESCE(enabled_at, now())
      ELSE NULL
    END,
    enabled_by = CASE WHEN p_enabled THEN p_actor ELSE NULL END,
    disabled_at = CASE WHEN p_enabled THEN disabled_at ELSE now() END,
    disable_reason = CASE
      WHEN p_enabled THEN NULL
      ELSE COALESCE(p_reason, 'Disabled by administrator')
    END,
    updated_at = now()
  WHERE standard_id = p_standard_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE INDEX IF NOT EXISTS question_kc_assignments_answer_time_idx
  ON public.question_kc_assignments (
    question_id,
    format,
    part_label,
    valid_from DESC
  )
  WHERE status IN ('confirmed', 'stale');

CREATE OR REPLACE FUNCTION public.apply_bkt_observation(
  p_source_kind text,
  p_source_attempt_id uuid,
  p_source_revision smallint DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_question_id text;
  v_question_set_id text;
  v_part_label text;
  v_mode text;
  v_correct boolean;
  v_answered_at timestamptz;
  v_format text;
  v_mapping public.question_kc_assignments;
  v_parameters public.bkt_parameter_sets;
  v_mastery public.student_kc_mastery;
  v_existing public.bkt_mastery_events;
  v_revision smallint := p_source_revision;
  v_prior double precision;
  v_posterior double precision;
  v_result double precision;
  v_event_id uuid;
  v_out_of_order boolean := false;
BEGIN
  IF p_source_kind = 'mcq_attempt' THEN
    SELECT
      attempt.user_id,
      attempt.question_id,
      NULL::text,
      NULL::text,
      attempt.mode,
      attempt.is_correct,
      attempt.answered_at
      INTO
        v_user_id,
        v_question_id,
        v_question_set_id,
        v_part_label,
        v_mode,
        v_correct,
        v_answered_at
    FROM public.attempts attempt
    WHERE attempt.id = p_source_attempt_id
      AND attempt.selected_option_id <> 'short-answer';
    v_format := 'mcq';
  ELSIF p_source_kind = 'saq_part_attempt' THEN
    SELECT
      attempt.user_id,
      attempt.question_id,
      attempt.question_set_id,
      attempt.part_label,
      attempt.mode,
      attempt.score = attempt.max_score,
      attempt.answered_at
      INTO
        v_user_id,
        v_question_id,
        v_question_set_id,
        v_part_label,
        v_mode,
        v_correct,
        v_answered_at
    FROM public.short_answer_attempts attempt
    WHERE attempt.id = p_source_attempt_id;
    v_format := 'saq';
  ELSE
    RAISE EXCEPTION 'Unsupported BKT source kind' USING ERRCODE = '23514';
  END IF;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT event.* INTO v_existing
  FROM public.bkt_mastery_events event
  WHERE event.source_kind = p_source_kind
    AND event.source_attempt_id = p_source_attempt_id
    AND event.event_type <> 'replay'
    AND event.superseded_at IS NULL
  ORDER BY event.source_revision DESC
  LIMIT 1;

  IF v_existing.mapping_id IS NOT NULL THEN
    -- Once an attempt has produced an event, its mapping is its immutable
    -- snapshot even if the attempt is later corrected.
    SELECT assignment.* INTO v_mapping
    FROM public.question_kc_assignments assignment
    WHERE assignment.id = v_existing.mapping_id;
  ELSE
    -- Delayed and offline attempts must use the half-open mapping interval
    -- [valid_from, valid_to) that contained answered_at, not today's mapping.
    -- A mapping made stale by a later content edit was still confirmed during
    -- its historical validity interval, so stale rows remain eligible here.
    SELECT assignment.* INTO v_mapping
    FROM public.question_kc_assignments assignment
    WHERE assignment.question_id = v_question_id
      AND assignment.part_label IS NOT DISTINCT FROM v_part_label
      AND assignment.format = v_format
      AND assignment.status IN ('confirmed', 'stale')
      AND assignment.valid_from <= v_answered_at
      AND (assignment.valid_to IS NULL OR v_answered_at < assignment.valid_to)
      AND (
        v_question_set_id IS NULL
        OR assignment.question_set_id = v_question_set_id
      )
    ORDER BY assignment.valid_from DESC
    LIMIT 1;
  END IF;

  IF v_mapping.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_existing.id IS NOT NULL
     AND v_existing.is_correct = v_correct
     AND v_existing.mapping_id = v_mapping.id THEN
    RETURN v_existing.id;
  END IF;

  SELECT parameter_set.* INTO v_parameters
  FROM public.bkt_parameter_sets parameter_set
  WHERE parameter_set.format = v_format AND parameter_set.active
  ORDER BY parameter_set.activated_at DESC
  LIMIT 1;

  IF v_parameters.id IS NULL THEN
    RAISE EXCEPTION 'No active BKT parameters for %', v_format;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    v_revision := GREATEST(v_revision, v_existing.source_revision + 1);
  END IF;

  INSERT INTO public.student_kc_mastery (
    user_id,
    kc_code,
    probability,
    mastered,
    last_parameter_set_id
  ) VALUES (
    v_user_id,
    v_mapping.kc_code,
    v_parameters.initial_mastery,
    false,
    v_parameters.id
  ) ON CONFLICT (user_id, kc_code) DO NOTHING;

  SELECT mastery.* INTO v_mastery
  FROM public.student_kc_mastery mastery
  WHERE mastery.user_id = v_user_id
    AND mastery.kc_code = v_mapping.kc_code
  FOR UPDATE;

  v_prior := v_mastery.probability;
  v_posterior := public.bkt_condition_probability(
    v_prior,
    v_correct,
    v_parameters.guess_rate,
    v_parameters.slip_rate
  );
  v_result := LEAST(1.0, GREATEST(0.0,
    v_posterior + (1 - v_posterior) * v_parameters.learning_rate
  ));
  v_out_of_order := v_mastery.latest_answered_at IS NOT NULL
    AND v_answered_at < v_mastery.latest_answered_at;

  v_event_id := gen_random_uuid();
  IF v_existing.id IS NOT NULL THEN
    UPDATE public.bkt_mastery_events
    SET superseded_at = now()
    WHERE id = v_existing.id;
  END IF;

  INSERT INTO public.bkt_mastery_events (
    id,
    user_id,
    kc_code,
    event_type,
    source_kind,
    source_attempt_id,
    source_revision,
    supersedes_event_id,
    mapping_id,
    parameter_set_id,
    question_id,
    part_label,
    question_format,
    mode,
    is_correct,
    prior_probability,
    posterior_probability,
    resulting_probability,
    answered_at
  ) VALUES (
    v_event_id,
    v_user_id,
    v_mapping.kc_code,
    CASE WHEN v_existing.id IS NULL THEN 'observation' ELSE 'correction' END,
    p_source_kind,
    p_source_attempt_id,
    v_revision,
    v_existing.id,
    v_mapping.id,
    v_parameters.id,
    v_question_id,
    v_part_label,
    v_format,
    v_mode,
    v_correct,
    v_prior,
    v_posterior,
    v_result,
    v_answered_at
  );

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.bkt_mastery_events
    SET superseded_by_event_id = v_event_id
    WHERE id = v_existing.id;
  END IF;

  IF v_out_of_order OR v_existing.id IS NOT NULL THEN
    PERFORM public.rebuild_student_kc_mastery(v_user_id, v_mapping.kc_code);
  ELSE
    UPDATE public.student_kc_mastery
    SET
      probability = v_result,
      mastered = v_result >= v_parameters.mastery_threshold,
      last_parameter_set_id = v_parameters.id,
      observation_count = observation_count + 1,
      latest_event_id = v_event_id,
      latest_answered_at = v_answered_at,
      lock_version = lock_version + 1,
      updated_at = now()
    WHERE user_id = v_user_id AND kc_code = v_mapping.kc_code;
  END IF;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_bkt_standard_rollout(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_bkt_standard_rollout(text, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_bkt_observation(text, uuid, smallint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_bkt_standard_rollout(text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_bkt_standard_rollout(text, uuid, boolean, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_bkt_observation(text, uuid, smallint)
  TO service_role;
