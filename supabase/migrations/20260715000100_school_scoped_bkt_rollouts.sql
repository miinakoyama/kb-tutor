-- Adaptive Practice serves each student only from their own school's question
-- bank (school_question_sets), but the rollout gate was keyed on standard_id
-- alone and validated coverage across every bank at once. A standard could
-- therefore pass validation globally while a particular school had no eligible
-- question for some KC, and enabling it sent that school's students straight
-- into a coverage gap at selection time.
--
-- Rollouts are now keyed on (school_id, standard_id) and every count the gate
-- checks is restricted to the school's own bank.

-- 1. Re-key the rollout table. An existing global rollout applied to every
--    school, so it expands into one row per school.
CREATE TEMP TABLE bkt_rollouts_backfill ON COMMIT DROP AS
  SELECT * FROM public.bkt_standard_rollouts;

DELETE FROM public.bkt_standard_rollouts;

ALTER TABLE public.bkt_standard_rollouts
  DROP CONSTRAINT bkt_standard_rollouts_pkey;

ALTER TABLE public.bkt_standard_rollouts
  ADD COLUMN school_id text NOT NULL
    REFERENCES public.schools(id) ON DELETE CASCADE;

ALTER TABLE public.bkt_standard_rollouts
  ADD CONSTRAINT bkt_standard_rollouts_pkey PRIMARY KEY (school_id, standard_id);

INSERT INTO public.bkt_standard_rollouts (
  school_id, standard_id, status, coverage_hash, eligible_question_count,
  covered_kc_count, active_kc_count, unresolved_self_practice_count,
  validated_at, enabled_at, disabled_at, enabled_by, disable_reason, updated_at
)
SELECT
  school.id, prior.standard_id, prior.status, prior.coverage_hash,
  prior.eligible_question_count, prior.covered_kc_count, prior.active_kc_count,
  prior.unresolved_self_practice_count, prior.validated_at, prior.enabled_at,
  prior.disabled_at, prior.enabled_by, prior.disable_reason, prior.updated_at
FROM bkt_rollouts_backfill prior
CROSS JOIN public.schools school;

CREATE INDEX IF NOT EXISTS bkt_standard_rollouts_school_status_idx
  ON public.bkt_standard_rollouts (school_id, status);

-- 2. The old signatures cannot coexist with the school-scoped ones, and leaving
--    them callable would leave a way to enable a standard without a school.
DROP FUNCTION IF EXISTS public.validate_bkt_standard_rollout(text, uuid);
DROP FUNCTION IF EXISTS public.set_bkt_standard_rollout(text, uuid, boolean, text);

CREATE OR REPLACE FUNCTION public.validate_bkt_standard_rollout(
  p_school_id text,
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

  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
    RAISE EXCEPTION 'Unknown school %', p_school_id USING ERRCODE = '23503';
  END IF;

  SELECT count(*)::integer INTO v_active
  FROM public.knowledge_components
  WHERE standard_id = p_standard_id AND active;

  -- Only questions in this school's bank can ever be selected for its students.
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE coverage.coverage_state <> 'valid')::integer
    INTO v_eligible, v_unresolved
  FROM public.bkt_question_coverage coverage
  JOIN public.school_question_sets link
    ON link.set_id = coverage.question_set_id
    AND link.school_id = p_school_id
  WHERE coverage.standard_id = p_standard_id
    AND coverage.include_in_self_practice;

  SELECT count(DISTINCT assignment.kc_code)::integer INTO v_covered
  FROM public.question_kc_assignments assignment
  JOIN public.generated_questions question
    ON question.set_id = assignment.question_set_id
    AND question.id = assignment.question_id
  JOIN public.school_question_sets link
    ON link.set_id = assignment.question_set_id
    AND link.school_id = p_school_id
  WHERE assignment.standard_id = p_standard_id
    AND assignment.valid_to IS NULL
    AND assignment.status = 'confirmed'
    AND question.include_in_self_practice;

  SELECT encode(extensions.digest(convert_to(
    concat_ws(
      '|',
      p_school_id,
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
        JOIN public.school_question_sets link
          ON link.set_id = coverage.question_set_id
          AND link.school_id = p_school_id
        WHERE coverage.standard_id = p_standard_id
          AND coverage.include_in_self_practice
      ), '')
    ),
    'UTF8'
  ), 'sha256'), 'hex') INTO v_hash;

  v_valid := v_active > 0 AND v_active = v_covered AND v_unresolved = 0;

  INSERT INTO public.bkt_standard_rollouts (
    school_id,
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
    p_school_id,
    p_standard_id,
    CASE WHEN v_valid THEN 'ready' ELSE 'disabled' END,
    v_hash,
    v_eligible,
    v_covered,
    v_active,
    v_unresolved,
    now(),
    now()
  ) ON CONFLICT (school_id, standard_id) DO UPDATE SET
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
  p_school_id text,
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
    PERFORM public.validate_bkt_standard_rollout(p_school_id, p_standard_id, p_actor);
  END IF;

  SELECT
    rollout.status,
    rollout.unresolved_self_practice_count,
    rollout.covered_kc_count,
    rollout.active_kc_count
    INTO v_status, v_unresolved, v_covered, v_active
  FROM public.bkt_standard_rollouts rollout
  WHERE rollout.school_id = p_school_id
    AND rollout.standard_id = p_standard_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Standard rollout has not been validated for this school'
      USING ERRCODE = '23514';
  END IF;

  IF p_enabled AND (
    v_status NOT IN ('ready', 'enabled')
    OR v_unresolved <> 0
    OR v_covered <> v_active
  ) THEN
    RAISE EXCEPTION 'Standard coverage is not ready for this school (status %, unresolved %, covered %, active %)',
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
  WHERE school_id = p_school_id
    AND standard_id = p_standard_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_bkt_standard_rollout(text, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_bkt_standard_rollout(text, text, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_bkt_standard_rollout(text, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_bkt_standard_rollout(text, text, uuid, boolean, text)
  TO service_role;
