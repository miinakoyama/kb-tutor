-- Replace a confirmed KC mapping without exposing a close-before-insert gap.

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
    ) THEN
      RAISE EXCEPTION 'Question part is not valid for this short-answer question'
        USING ERRCODE = '23514';
    END IF;
  ELSIF p_part_label IS NOT NULL THEN
    RAISE EXCEPTION 'MCQ mappings cannot have a part label'
      USING ERRCODE = '23514';
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

  UPDATE public.question_kc_assignments assignment
  SET valid_to = v_now
  WHERE assignment.question_set_id = p_question_set_id
    AND assignment.question_id = p_question_id
    AND assignment.part_label IS NOT DISTINCT FROM p_part_label
    AND assignment.valid_to IS NULL;

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
    public.bkt_question_content_hash(v_payload),
    p_actor
  );

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

REVOKE ALL ON FUNCTION public.replace_question_kc_mapping(text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_question_kc_mapping(text, text, text, text, uuid)
  TO service_role;
