-- Auditable legacy classification, coverage reporting, and fail-closed rollout.

CREATE TABLE IF NOT EXISTS public.kc_classification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'created' CHECK (
    status IN ('created', 'running', 'preview_complete', 'approved', 'published', 'failed', 'rolled_back')
  ),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  classifier_a_model text NOT NULL,
  classifier_b_model text NOT NULL,
  classifier_a_prompt_version text NOT NULL,
  classifier_b_prompt_version text NOT NULL,
  target_count integer NOT NULL DEFAULT 0 CHECK (target_count >= 0),
  completed_count integer NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  agreement_count integer NOT NULL DEFAULT 0 CHECK (agreement_count >= 0),
  unresolved_count integer NOT NULL DEFAULT 0 CHECK (unresolved_count >= 0),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  rolled_back_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kc_classification_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.kc_classification_runs(id) ON DELETE CASCADE,
  question_set_id text NOT NULL,
  question_id text NOT NULL,
  pass smallint NOT NULL CHECK (pass IN (1, 2)),
  model_id text NOT NULL,
  prompt_version text NOT NULL,
  source_content_hash text NOT NULL CHECK (source_content_hash ~ '^[0-9a-f]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('assigned', 'ambiguous', 'invalid', 'error')),
  kc_code text REFERENCES public.knowledge_components(code),
  rationale text,
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, question_set_id, question_id, pass),
  FOREIGN KEY (question_set_id, question_id)
    REFERENCES public.generated_questions(set_id, id) ON DELETE CASCADE,
  CHECK ((outcome = 'assigned' AND kc_code IS NOT NULL AND btrim(COALESCE(rationale, '')) <> '') OR outcome <> 'assigned')
);

CREATE TABLE IF NOT EXISTS public.bkt_standard_rollouts (
  standard_id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'validating', 'ready', 'enabled')),
  coverage_hash text,
  eligible_question_count integer NOT NULL DEFAULT 0,
  covered_kc_count integer NOT NULL DEFAULT 0,
  active_kc_count integer NOT NULL DEFAULT 0,
  unresolved_self_practice_count integer NOT NULL DEFAULT 0,
  validated_at timestamptz,
  enabled_at timestamptz,
  disabled_at timestamptz NOT NULL DEFAULT now(),
  enabled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  disable_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.question_kc_assignments
  ADD CONSTRAINT question_kc_assignments_classification_run_fkey
  FOREIGN KEY (classification_run_id) REFERENCES public.kc_classification_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS kc_classification_runs_status_idx
  ON public.kc_classification_runs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS kc_classification_decisions_run_outcome_idx
  ON public.kc_classification_decisions (run_id, outcome);
CREATE INDEX IF NOT EXISTS kc_classification_decisions_question_idx
  ON public.kc_classification_decisions (question_set_id, question_id, created_at DESC);

CREATE OR REPLACE VIEW public.bkt_question_coverage
WITH (security_barrier = true)
AS
SELECT
  q.set_id AS question_set_id,
  q.id AS question_id,
  q.payload->>'standardId' AS standard_id,
  CASE WHEN q.payload->>'questionType' = 'open-ended' THEN 'saq' ELSE 'mcq' END AS format,
  q.include_in_self_practice,
  CASE
    WHEN q.payload->>'questionType' = 'open-ended'
      THEN jsonb_array_length(COALESCE(q.payload#>'{shortAnswer,parts}', '[]'::jsonb))
    ELSE 1
  END AS expected_slots,
  count(a.id) FILTER (WHERE a.valid_to IS NULL AND a.status = 'confirmed')::integer AS confirmed_slots,
  bool_or(a.status IN ('invalid', 'stale') AND a.valid_to IS NULL) AS has_invalid_mapping,
  array_remove(array_agg(DISTINCT a.kc_code) FILTER (
    WHERE a.valid_to IS NULL AND a.status = 'confirmed'
  ), NULL) AS confirmed_kc_codes,
  public.bkt_question_content_hash(q.payload) AS current_content_hash,
  CASE
    WHEN NOT q.include_in_self_practice THEN 'excluded'
    WHEN bool_or(a.status IN ('invalid', 'stale') AND a.valid_to IS NULL) THEN 'invalid'
    WHEN count(a.id) FILTER (WHERE a.valid_to IS NULL AND a.status = 'confirmed') =
      CASE WHEN q.payload->>'questionType' = 'open-ended'
        THEN jsonb_array_length(COALESCE(q.payload#>'{shortAnswer,parts}', '[]'::jsonb)) ELSE 1 END
      THEN 'valid'
    ELSE 'unresolved'
  END AS coverage_state
FROM public.generated_questions q
LEFT JOIN public.question_kc_assignments a
  ON a.question_set_id = q.set_id AND a.question_id = q.id
GROUP BY q.set_id, q.id, q.payload, q.include_in_self_practice;

CREATE OR REPLACE FUNCTION public.bkt_assert_admin(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin authorization required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_kc_classification_run(p_run_id uuid, p_actor uuid)
RETURNS TABLE(standard_id text, published_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.bkt_assert_admin(p_actor);
  IF NOT EXISTS (
    SELECT 1 FROM public.kc_classification_runs
    WHERE id = p_run_id AND status IN ('preview_complete', 'approved', 'published')
  ) THEN
    RAISE EXCEPTION 'Classification run is not publishable' USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  WITH agreed AS (
    SELECT d1.question_set_id, d1.question_id, d1.kc_code, d1.source_content_hash
    FROM public.kc_classification_decisions d1
    JOIN public.kc_classification_decisions d2
      ON d2.run_id = d1.run_id
      AND d2.question_set_id = d1.question_set_id
      AND d2.question_id = d1.question_id
      AND d2.pass = 2
    JOIN public.generated_questions q
      ON q.set_id = d1.question_set_id AND q.id = d1.question_id
    JOIN public.knowledge_components kc ON kc.code = d1.kc_code
    WHERE d1.run_id = p_run_id AND d1.pass = 1
      AND d1.outcome = 'assigned' AND d2.outcome = 'assigned'
      AND d1.kc_code = d2.kc_code
      AND d1.source_content_hash = d2.source_content_hash
      AND d1.source_content_hash = public.bkt_question_content_hash(q.payload)
      AND kc.active AND kc.standard_id = q.payload->>'standardId'
  ), inserted AS (
    INSERT INTO public.question_kc_assignments (
      question_set_id, question_id, part_label, format, standard_id, kc_code,
      status, provenance, source_content_hash, classification_run_id, created_by
    )
    SELECT a.question_set_id, a.question_id, NULL, 'mcq', kc.standard_id, a.kc_code,
      'confirmed', 'model', a.source_content_hash, p_run_id, p_actor
    FROM agreed a JOIN public.knowledge_components kc ON kc.code = a.kc_code
    WHERE NOT EXISTS (
      SELECT 1 FROM public.question_kc_assignments current
      WHERE current.question_set_id = a.question_set_id
        AND current.question_id = a.question_id
        AND current.part_label IS NULL
        AND current.valid_to IS NULL AND current.status = 'confirmed'
    )
    ON CONFLICT DO NOTHING
    RETURNING public.question_kc_assignments.standard_id AS inserted_standard_id
  )
  SELECT inserted.inserted_standard_id, count(*)::integer
  FROM inserted GROUP BY inserted.inserted_standard_id;

  UPDATE public.kc_classification_runs
  SET status = 'published', approved_by = COALESCE(approved_by, p_actor),
      approved_at = COALESCE(approved_at, now()), published_at = COALESCE(published_at, now())
  WHERE id = p_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_kc_classification_run(p_run_id uuid, p_actor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM public.bkt_assert_admin(p_actor);
  UPDATE public.question_kc_assignments
  SET valid_to = COALESCE(valid_to, now())
  WHERE classification_run_id = p_run_id AND valid_to IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.bkt_standard_rollouts r
  SET status = 'disabled', disabled_at = now(), enabled_at = NULL, enabled_by = NULL,
      disable_reason = 'Classification run rolled back', updated_at = now()
  WHERE EXISTS (
    SELECT 1 FROM public.question_kc_assignments a
    WHERE a.classification_run_id = p_run_id AND a.standard_id = r.standard_id
  );
  UPDATE public.kc_classification_runs
  SET status = 'rolled_back', rolled_back_at = COALESCE(rolled_back_at, now())
  WHERE id = p_run_id AND status IN ('published', 'rolled_back');
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_bkt_standard_rollout(p_standard_id text, p_actor uuid)
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
BEGIN
  PERFORM public.bkt_assert_admin(p_actor);
  SELECT count(*)::integer INTO v_active FROM public.knowledge_components
    WHERE standard_id = p_standard_id AND active;
  SELECT count(*)::integer,
    count(*) FILTER (WHERE coverage_state <> 'valid')::integer
    INTO v_eligible, v_unresolved
    FROM public.bkt_question_coverage
    WHERE standard_id = p_standard_id AND include_in_self_practice;
  SELECT count(DISTINCT a.kc_code)::integer INTO v_covered
    FROM public.question_kc_assignments a
    JOIN public.generated_questions q ON q.set_id = a.question_set_id AND q.id = a.question_id
    WHERE a.standard_id = p_standard_id AND a.valid_to IS NULL AND a.status = 'confirmed'
      AND q.include_in_self_practice;
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
          concat_ws(':', coverage.question_set_id, coverage.question_id,
            coverage.current_content_hash, coverage.coverage_state,
            coverage.confirmed_kc_codes::text),
          ',' ORDER BY coverage.question_set_id, coverage.question_id
        )
        FROM public.bkt_question_coverage coverage
        WHERE coverage.standard_id = p_standard_id
          AND coverage.include_in_self_practice
      ), '')
    ),
    'UTF8'
  ), 'sha256'), 'hex') INTO v_hash;

  INSERT INTO public.bkt_standard_rollouts (
    standard_id, status, coverage_hash, eligible_question_count, covered_kc_count,
    active_kc_count, unresolved_self_practice_count, validated_at, updated_at
  ) VALUES (
    p_standard_id,
    CASE WHEN v_active > 0 AND v_active = v_covered AND v_unresolved = 0 THEN 'ready' ELSE 'disabled' END,
    v_hash, v_eligible, v_covered, v_active, v_unresolved, now(), now()
  ) ON CONFLICT (standard_id) DO UPDATE SET
    status = EXCLUDED.status, coverage_hash = EXCLUDED.coverage_hash,
    eligible_question_count = EXCLUDED.eligible_question_count,
    covered_kc_count = EXCLUDED.covered_kc_count, active_kc_count = EXCLUDED.active_kc_count,
    unresolved_self_practice_count = EXCLUDED.unresolved_self_practice_count,
    validated_at = now(), updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_bkt_standard_rollout(
  p_standard_id text, p_actor uuid, p_enabled boolean, p_reason text DEFAULT NULL
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
    -- Recompute the content/mapping coverage hash at the enable boundary so a
    -- stale `ready` row cannot be enabled after content changes.
    PERFORM public.validate_bkt_standard_rollout(p_standard_id, p_actor);
  END IF;
  SELECT r.status, r.unresolved_self_practice_count, r.covered_kc_count, r.active_kc_count
    INTO v_status, v_unresolved, v_covered, v_active
  FROM public.bkt_standard_rollouts r
  WHERE r.standard_id = p_standard_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Standard rollout has not been validated' USING ERRCODE = '23514';
  END IF;
  IF p_enabled AND (v_status <> 'ready' OR v_unresolved <> 0 OR v_covered <> v_active) THEN
    RAISE EXCEPTION 'Standard coverage is not ready (status %, unresolved %, covered %, active %)',
      v_status, v_unresolved, v_covered, v_active
      USING ERRCODE = '23514';
  END IF;
  UPDATE public.bkt_standard_rollouts SET
    status = CASE WHEN p_enabled THEN 'enabled' ELSE 'disabled' END,
    enabled_at = CASE WHEN p_enabled THEN now() ELSE NULL END,
    enabled_by = CASE WHEN p_enabled THEN p_actor ELSE NULL END,
    disabled_at = CASE WHEN p_enabled THEN disabled_at ELSE now() END,
    disable_reason = CASE WHEN p_enabled THEN NULL ELSE COALESCE(p_reason, 'Disabled by administrator') END,
    updated_at = now()
  WHERE standard_id = p_standard_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

ALTER TABLE public.kc_classification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kc_classification_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bkt_standard_rollouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY kc_classification_runs_admin_read ON public.kc_classification_runs
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY kc_classification_decisions_admin_read ON public.kc_classification_decisions
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY bkt_standard_rollouts_read ON public.bkt_standard_rollouts
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.kc_classification_runs, public.kc_classification_decisions FROM anon, authenticated;
REVOKE ALL ON public.bkt_standard_rollouts FROM anon, authenticated;
GRANT SELECT ON public.kc_classification_runs, public.kc_classification_decisions TO authenticated;
GRANT SELECT ON public.bkt_standard_rollouts TO authenticated;
GRANT ALL ON public.kc_classification_runs, public.kc_classification_decisions, public.bkt_standard_rollouts TO service_role;
REVOKE ALL ON FUNCTION public.bkt_assert_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_kc_classification_run(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rollback_kc_classification_run(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_bkt_standard_rollout(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_bkt_standard_rollout(text, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_kc_classification_run(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rollback_kc_classification_run(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_bkt_standard_rollout(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_bkt_standard_rollout(text, uuid, boolean, text) TO service_role;
GRANT SELECT ON public.bkt_question_coverage TO service_role;
