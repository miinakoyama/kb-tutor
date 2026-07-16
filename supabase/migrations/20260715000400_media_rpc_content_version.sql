-- Serve question media for the same content version the student loaded.
--
-- The list RPC returns each row's content_version with a media-stripped
-- payload. If a teacher edits the question between the list load and the lazy
-- media request, the previous media RPC (keyed only by set/question id) could
-- splice the NEW row's image into the OLD text/options still on screen — and
-- the attempt would be scored against the old contentVersion. Media must come
-- from the same version snapshot as the text.
--
-- generated_question_versions (20260714000000) already snapshots every
-- payload per content_version, so:
--   * requested version == current row  -> current payload (no snapshot read)
--   * requested version is older        -> snapshot payload for that version
--   * requested version unknown         -> no row (client renders without
--     media, which beats showing the wrong image)
--   * p_content_version IS NULL         -> current payload (back-compat)

DROP FUNCTION IF EXISTS public.get_self_practice_question_media(text, text);

CREATE FUNCTION public.get_self_practice_question_media(
  p_set_id text,
  p_question_id text,
  p_content_version uuid DEFAULT NULL
)
RETURNS TABLE (
  image_url text,
  stimulus_image_b64 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NULLIF(src.payload ->> 'imageUrl', ''),
    NULLIF(src.payload #>> '{shortAnswer,stimulus,imageB64}', '')
  FROM public.generated_questions gq
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN p_content_version IS NULL OR gq.content_version = p_content_version
        THEN gq.payload
      ELSE (
        SELECT gqv.payload
        FROM public.generated_question_versions gqv
        WHERE gqv.question_set_id = gq.set_id
          AND gqv.question_id = gq.id
          AND gqv.content_version = p_content_version
      )
    END AS payload
  ) src
  WHERE gq.set_id = p_set_id
    AND gq.id = p_question_id
    AND gq.include_in_self_practice
    AND public.can_access_school_linked_set(p_set_id)
    AND src.payload IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_self_practice_question_media(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_self_practice_question_media(text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_self_practice_question_media(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_self_practice_question_media(text, text, uuid) TO service_role;
