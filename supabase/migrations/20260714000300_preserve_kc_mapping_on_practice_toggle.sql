-- Preserve mapping provenance when only Self Practice eligibility changes.
-- This migration updates databases that already applied the original BKT
-- catalog migration; the original definition is also corrected for resets.

CREATE OR REPLACE FUNCTION public.sync_question_kc_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_standard_id text := btrim(COALESCE(NEW.payload->>'standardId', ''));
  v_hash text := public.bkt_question_content_hash(NEW.payload);
  v_is_saq boolean := COALESCE(NEW.payload->>'questionType', '') = 'open-ended';
  v_kc_code text;
  v_part record;
  v_mapping_count integer := 0;
  v_current_mapping_count integer := 0;
  v_expected_mapping_count integer := CASE
    WHEN v_is_saq THEN jsonb_array_length(
      COALESCE(NEW.payload#>'{shortAnswer,parts}', '[]'::jsonb)
    )
    ELSE 1
  END;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.payload IS NOT DISTINCT FROM OLD.payload
     AND NEW.include_in_self_practice IS NOT DISTINCT FROM OLD.include_in_self_practice THEN
    RETURN NEW;
  END IF;

  -- Do not rewrite a complete current mapping for an eligibility-only toggle.
  -- Published model mappings retain classification_run_id and remain
  -- rollbackable. Incomplete coverage falls through to normal validation.
  IF TG_OP = 'UPDATE' AND NEW.payload IS NOT DISTINCT FROM OLD.payload THEN
    SELECT count(*)::integer
      INTO v_current_mapping_count
    FROM public.question_kc_assignments assignment
    WHERE assignment.question_set_id = NEW.set_id
      AND assignment.question_id = NEW.id
      AND assignment.valid_to IS NULL
      AND assignment.status = 'confirmed'
      AND assignment.source_content_hash = v_hash
      AND (
        (
          NOT v_is_saq
          AND assignment.format = 'mcq'
          AND assignment.part_label IS NULL
        ) OR (
          v_is_saq
          AND assignment.format = 'saq'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              COALESCE(NEW.payload#>'{shortAnswer,parts}', '[]'::jsonb)
            ) AS part
            WHERE part->>'label' = assignment.part_label
          )
        )
      );

    IF v_expected_mapping_count > 0
       AND v_current_mapping_count = v_expected_mapping_count THEN
      RETURN NEW;
    END IF;
  END IF;

  UPDATE public.question_kc_assignments
  SET valid_to = now(),
      status = CASE WHEN source_content_hash = v_hash THEN status ELSE 'stale' END
  WHERE question_set_id = NEW.set_id
    AND question_id = NEW.id
    AND valid_to IS NULL
    AND source_content_hash <> v_hash;

  IF v_standard_id = '' THEN
    IF NEW.include_in_self_practice THEN
      RAISE EXCEPTION 'Adaptive-eligible question % requires standardId', NEW.id
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT v_is_saq THEN
    v_kc_code := btrim(COALESCE(NEW.payload->>'kcCode', ''));
    IF v_kc_code <> '' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.knowledge_components kc
        WHERE kc.code = v_kc_code AND kc.standard_id = v_standard_id AND kc.active
      ) THEN
        RAISE EXCEPTION 'Question % has invalid KC % for standard %', NEW.id, v_kc_code, v_standard_id
          USING ERRCODE = '23514';
      END IF;
      UPDATE public.question_kc_assignments
      SET valid_to = now()
      WHERE question_set_id = NEW.set_id AND question_id = NEW.id
        AND part_label IS NULL AND valid_to IS NULL;
      INSERT INTO public.question_kc_assignments (
        question_set_id, question_id, part_label, format, standard_id, kc_code,
        status, provenance, source_content_hash, created_by
      ) VALUES (
        NEW.set_id, NEW.id, NULL, 'mcq', v_standard_id, v_kc_code,
        'confirmed', 'content', v_hash, NEW.user_id
      );
      v_mapping_count := 1;
    END IF;
  ELSE
    FOR v_part IN
      SELECT key AS part_label, value->>'kcCode' AS kc_code
      FROM jsonb_each(COALESCE(NEW.payload#>'{shortAnswer,blueprint,taskSequence}', '{}'::jsonb))
      WHERE key IN ('A', 'B', 'C')
    LOOP
      v_kc_code := btrim(COALESCE(v_part.kc_code, ''));
      IF v_kc_code = '' OR NOT EXISTS (
        SELECT 1 FROM public.knowledge_components kc
        WHERE kc.code = v_kc_code AND kc.standard_id = v_standard_id AND kc.active
      ) THEN
        RAISE EXCEPTION 'Question % part % has invalid KC % for standard %',
          NEW.id, v_part.part_label, v_kc_code, v_standard_id
          USING ERRCODE = '23514';
      END IF;
      UPDATE public.question_kc_assignments
      SET valid_to = now()
      WHERE question_set_id = NEW.set_id AND question_id = NEW.id
        AND part_label = v_part.part_label AND valid_to IS NULL;
      INSERT INTO public.question_kc_assignments (
        question_set_id, question_id, part_label, format, standard_id, kc_code,
        status, provenance, source_content_hash, created_by
      ) VALUES (
        NEW.set_id, NEW.id, v_part.part_label, 'saq', v_standard_id, v_kc_code,
        'confirmed', 'content', v_hash, NEW.user_id
      );
      v_mapping_count := v_mapping_count + 1;
    END LOOP;

    IF v_mapping_count <> jsonb_array_length(COALESCE(NEW.payload#>'{shortAnswer,parts}', '[]'::jsonb)) THEN
      RAISE EXCEPTION 'Every scored part of question % requires exactly one KC', NEW.id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.include_in_self_practice AND v_mapping_count = 0 THEN
    RAISE EXCEPTION 'Adaptive-eligible question % requires confirmed KC coverage', NEW.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_question_kc_assignments() FROM PUBLIC, anon, authenticated;
