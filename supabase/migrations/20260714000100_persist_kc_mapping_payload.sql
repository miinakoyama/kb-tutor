-- Keep embedded KC metadata and versioned mapping rows consistent. Mapping
-- changes are persisted in generated_questions.payload so later content edits
-- cannot restore stale KCs through sync_question_kc_assignments().

CREATE OR REPLACE FUNCTION public.replace_question_kc_mapping(
  p_question_set_id text,
  p_question_id text,
  p_part_label text,
  p_kc_code text,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb;
  v_updated_payload jsonb;
  v_standard_id text;
  v_is_saq boolean;
  v_now timestamptz := now();
BEGIN
  PERFORM public.bkt_assert_admin(p_actor);

  SELECT question.payload
    INTO v_payload
  FROM public.generated_questions question
  WHERE question.set_id = p_question_set_id
    AND question.id = p_question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found' USING ERRCODE = 'P0002';
  END IF;

  v_standard_id := btrim(COALESCE(v_payload->>'standardId', ''));
  v_is_saq := COALESCE(v_payload->>'questionType', '') = 'open-ended';

  IF v_standard_id = '' THEN
    RAISE EXCEPTION 'Question does not have a standard' USING ERRCODE = '23514';
  END IF;

  IF v_is_saq THEN
    IF p_part_label NOT IN ('A', 'B', 'C') OR NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        COALESCE(v_payload#>'{shortAnswer,parts}', '[]'::jsonb)
      ) AS part
      WHERE part->>'label' = p_part_label
    ) OR v_payload #> ARRAY[
      'shortAnswer', 'blueprint', 'taskSequence', p_part_label
    ] IS NULL THEN
      RAISE EXCEPTION 'Question part is not valid for this short-answer question'
        USING ERRCODE = '23514';
    END IF;
    v_updated_payload := jsonb_set(
      v_payload,
      ARRAY['shortAnswer', 'blueprint', 'taskSequence', p_part_label, 'kcCode'],
      to_jsonb(p_kc_code),
      true
    );
  ELSE
    IF p_part_label IS NOT NULL THEN
      RAISE EXCEPTION 'MCQ mappings cannot have a part label'
        USING ERRCODE = '23514';
    END IF;
    v_updated_payload := jsonb_set(
      v_payload,
      '{kcCode}',
      to_jsonb(p_kc_code),
      true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.knowledge_components kc
    WHERE kc.code = p_kc_code
      AND kc.standard_id = v_standard_id
      AND kc.active
  ) THEN
    RAISE EXCEPTION 'KC is not active in the question standard'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.generated_questions question
  SET payload = v_updated_payload,
      updated_at = v_now
  WHERE question.set_id = p_question_set_id
    AND question.id = p_question_id;

  -- The payload trigger creates the active content mapping. Mark the selected
  -- slot as an explicit admin decision without creating a second open row.
  UPDATE public.question_kc_assignments assignment
  SET provenance = 'admin',
      classification_run_id = NULL,
      created_by = p_actor
  WHERE assignment.question_set_id = p_question_set_id
    AND assignment.question_id = p_question_id
    AND assignment.part_label IS NOT DISTINCT FROM p_part_label
    AND assignment.kc_code = p_kc_code
    AND assignment.valid_to IS NULL
    AND assignment.status = 'confirmed';

  IF NOT FOUND THEN
    -- Handles an already-embedded KC whose mapping row was missing before this
    -- repair. The insert remains atomic with the payload update.
    INSERT INTO public.question_kc_assignments (
      question_set_id,
      question_id,
      part_label,
      format,
      standard_id,
      kc_code,
      status,
      provenance,
      source_content_hash,
      created_by
    ) VALUES (
      p_question_set_id,
      p_question_id,
      p_part_label,
      CASE WHEN v_is_saq THEN 'saq' ELSE 'mcq' END,
      v_standard_id,
      p_kc_code,
      'confirmed',
      'admin',
      public.bkt_question_content_hash(v_updated_payload),
      p_actor
    );
  END IF;

  INSERT INTO public.bkt_standard_rollouts (
    standard_id,
    status,
    disabled_at,
    disable_reason,
    updated_at
  ) VALUES (
    v_standard_id,
    'disabled',
    v_now,
    'KC mapping changed',
    v_now
  ) ON CONFLICT (standard_id) DO UPDATE SET
    status = 'disabled',
    enabled_at = NULL,
    enabled_by = NULL,
    disabled_at = v_now,
    disable_reason = 'KC mapping changed',
    updated_at = v_now;

  RETURN jsonb_build_object(
    'standardId', v_standard_id,
    'mappingChanged', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_question_kc_mapping(
  p_question_set_id text,
  p_question_id text,
  p_part_label text,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb;
  v_standard_id text;
  v_mapping_changed boolean;
  v_now timestamptz := now();
BEGIN
  PERFORM public.bkt_assert_admin(p_actor);

  SELECT question.payload
    INTO v_payload
  FROM public.generated_questions question
  WHERE question.set_id = p_question_set_id
    AND question.id = p_question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE(v_payload->>'questionType', '') = 'open-ended'
     OR p_part_label IS NOT NULL THEN
    RAISE EXCEPTION 'Short-answer KC mappings require a replacement KC'
      USING ERRCODE = '23514';
  END IF;

  v_standard_id := btrim(COALESCE(v_payload->>'standardId', ''));
  SELECT EXISTS (
    SELECT 1
    FROM public.question_kc_assignments assignment
    WHERE assignment.question_set_id = p_question_set_id
      AND assignment.question_id = p_question_id
      AND assignment.part_label IS NULL
      AND assignment.valid_to IS NULL
  ) INTO v_mapping_changed;

  IF NOT v_mapping_changed THEN
    RETURN jsonb_build_object(
      'standardId', v_standard_id,
      'mappingChanged', false
    );
  END IF;

  -- Unmapped questions cannot remain adaptive-eligible. Removing the embedded
  -- KC and Self Practice flag in one update lets the sync trigger close any
  -- hash-bound row without rejecting the intermediate state.
  UPDATE public.generated_questions question
  SET payload = question.payload - 'kcCode',
      include_in_self_practice = false,
      updated_at = v_now
  WHERE question.set_id = p_question_set_id
    AND question.id = p_question_id;

  UPDATE public.question_kc_assignments assignment
  SET valid_to = v_now
  WHERE assignment.question_set_id = p_question_set_id
    AND assignment.question_id = p_question_id
    AND assignment.part_label IS NULL
    AND assignment.valid_to IS NULL;

  IF v_standard_id <> '' THEN
    INSERT INTO public.bkt_standard_rollouts (
      standard_id,
      status,
      disabled_at,
      disable_reason,
      updated_at
    ) VALUES (
      v_standard_id,
      'disabled',
      v_now,
      'KC mapping changed',
      v_now
    ) ON CONFLICT (standard_id) DO UPDATE SET
      status = 'disabled',
      enabled_at = NULL,
      enabled_by = NULL,
      disabled_at = v_now,
      disable_reason = 'KC mapping changed',
      updated_at = v_now;
  END IF;

  RETURN jsonb_build_object(
    'standardId', v_standard_id,
    'mappingChanged', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_kc_classification_run(
  p_run_id uuid,
  p_actor uuid
)
RETURNS TABLE(standard_id text, published_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_question record;
  v_counts jsonb := '{}'::jsonb;
  v_count_entry record;
  v_new_payload jsonb;
  v_count integer;
BEGIN
  PERFORM public.bkt_assert_admin(p_actor);
  IF NOT EXISTS (
    SELECT 1 FROM public.kc_classification_runs
    WHERE id = p_run_id AND status IN ('preview_complete', 'approved', 'published')
  ) THEN
    RAISE EXCEPTION 'Classification run is not publishable' USING ERRCODE = '23514';
  END IF;

  FOR v_question IN
    SELECT
      d1.question_set_id,
      d1.question_id,
      d1.kc_code,
      d1.source_content_hash,
      kc.standard_id
    FROM public.kc_classification_decisions d1
    JOIN public.kc_classification_decisions d2
      ON d2.run_id = d1.run_id
      AND d2.question_set_id = d1.question_set_id
      AND d2.question_id = d1.question_id
      AND d2.pass = 2
    JOIN public.generated_questions question
      ON question.set_id = d1.question_set_id
      AND question.id = d1.question_id
    JOIN public.knowledge_components kc
      ON kc.code = d1.kc_code
    WHERE d1.run_id = p_run_id
      AND d1.pass = 1
      AND d1.outcome = 'assigned'
      AND d2.outcome = 'assigned'
      AND d1.kc_code = d2.kc_code
      AND d1.source_content_hash = d2.source_content_hash
      AND d1.source_content_hash = public.bkt_question_content_hash(question.payload)
      AND COALESCE(question.payload->>'questionType', '') <> 'open-ended'
      AND kc.active
      AND kc.standard_id = question.payload->>'standardId'
      AND NOT EXISTS (
        SELECT 1
        FROM public.question_kc_assignments current
        WHERE current.question_set_id = d1.question_set_id
          AND current.question_id = d1.question_id
          AND current.part_label IS NULL
          AND current.valid_to IS NULL
          AND current.status = 'confirmed'
      )
  LOOP
    v_new_payload := NULL;
    UPDATE public.generated_questions question
    SET payload = jsonb_set(
          question.payload,
          '{kcCode}',
          to_jsonb(v_question.kc_code::text),
          true
        ),
        updated_at = now()
    WHERE question.set_id = v_question.question_set_id
      AND question.id = v_question.question_id
      AND public.bkt_question_content_hash(question.payload) = v_question.source_content_hash
    RETURNING question.payload INTO v_new_payload;

    IF v_new_payload IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.question_kc_assignments assignment
    SET provenance = 'model',
        classification_run_id = p_run_id,
        created_by = p_actor
    WHERE assignment.question_set_id = v_question.question_set_id
      AND assignment.question_id = v_question.question_id
      AND assignment.part_label IS NULL
      AND assignment.kc_code = v_question.kc_code
      AND assignment.valid_to IS NULL
      AND assignment.status = 'confirmed';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unable to persist classified KC mapping'
        USING ERRCODE = '23514';
    END IF;

    v_count := COALESCE((v_counts->>v_question.standard_id)::integer, 0) + 1;
    v_counts := jsonb_set(
      v_counts,
      ARRAY[v_question.standard_id],
      to_jsonb(v_count),
      true
    );
  END LOOP;

  UPDATE public.kc_classification_runs
  SET status = 'published',
      approved_by = COALESCE(approved_by, p_actor),
      approved_at = COALESCE(approved_at, now()),
      published_at = COALESCE(published_at, now())
  WHERE id = p_run_id;

  FOR v_count_entry IN SELECT key, value FROM jsonb_each_text(v_counts)
  LOOP
    standard_id := v_count_entry.key;
    published_count := v_count_entry.value::integer;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_kc_classification_run(
  p_run_id uuid,
  p_actor uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mapping record;
  v_count integer := 0;
  v_standard_ids text[] := ARRAY[]::text[];
BEGIN
  PERFORM public.bkt_assert_admin(p_actor);

  FOR v_mapping IN
    SELECT
      assignment.question_set_id,
      assignment.question_id,
      assignment.standard_id,
      assignment.kc_code
    FROM public.question_kc_assignments assignment
    WHERE assignment.classification_run_id = p_run_id
      AND assignment.valid_to IS NULL
    FOR UPDATE
  LOOP
    UPDATE public.generated_questions question
    SET payload = question.payload - 'kcCode',
        include_in_self_practice = false,
        updated_at = now()
    WHERE question.set_id = v_mapping.question_set_id
      AND question.id = v_mapping.question_id
      AND question.payload->>'kcCode' = v_mapping.kc_code;

    UPDATE public.question_kc_assignments assignment
    SET valid_to = COALESCE(assignment.valid_to, now())
    WHERE assignment.question_set_id = v_mapping.question_set_id
      AND assignment.question_id = v_mapping.question_id
      AND assignment.part_label IS NULL
      AND assignment.classification_run_id = p_run_id
      AND assignment.valid_to IS NULL;

    v_count := v_count + 1;
    IF NOT (v_mapping.standard_id = ANY(v_standard_ids)) THEN
      v_standard_ids := array_append(v_standard_ids, v_mapping.standard_id);
    END IF;
  END LOOP;

  UPDATE public.bkt_standard_rollouts rollout
  SET status = 'disabled',
      disabled_at = now(),
      enabled_at = NULL,
      enabled_by = NULL,
      disable_reason = 'Classification run rolled back',
      updated_at = now()
  WHERE rollout.standard_id = ANY(v_standard_ids);

  UPDATE public.kc_classification_runs
  SET status = 'rolled_back',
      rolled_back_at = COALESCE(rolled_back_at, now())
  WHERE id = p_run_id AND status IN ('published', 'rolled_back');

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_question_kc_mapping(text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_question_kc_mapping(text, text, text, text, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.withdraw_question_kc_mapping(text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_question_kc_mapping(text, text, text, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.publish_kc_classification_run(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_kc_classification_run(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.rollback_kc_classification_run(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_kc_classification_run(uuid, uuid)
  TO service_role;
