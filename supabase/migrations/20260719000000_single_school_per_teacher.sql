-- A teacher account may belong to at most one school. Admin access remains
-- global and does not depend on school_teachers membership.

CREATE TABLE IF NOT EXISTS public.teacher_school_membership_dedup_audit (
  teacher_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  removed_school_id text NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kept_school_id text NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  removed_created_at timestamptz NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_user_id, removed_school_id)
);

ALTER TABLE public.teacher_school_membership_dedup_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teacher_school_membership_dedup_audit_admin_read"
  ON public.teacher_school_membership_dedup_audit
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Preserve legacy owner-only assignments before school_teachers becomes the
-- canonical source. The school creation time is the best available timestamp
-- when the legacy row has no explicit assignment timestamp.
INSERT INTO public.school_teachers (
  school_id,
  teacher_user_id,
  teacher_role,
  created_at
)
SELECT
  s.id,
  s.teacher_user_id,
  'primary',
  s.created_at
FROM public.schools s
WHERE s.teacher_user_id IS NOT NULL
ON CONFLICT (school_id, teacher_user_id) DO NOTHING;

-- Record every membership that will be removed. The newest assignment wins;
-- school_id provides deterministic ordering for identical timestamps.
WITH ranked AS (
  SELECT
    st.school_id,
    st.teacher_user_id,
    st.created_at,
    first_value(st.school_id) OVER (
      PARTITION BY st.teacher_user_id
      ORDER BY st.created_at DESC, st.school_id DESC
    ) AS kept_school_id,
    row_number() OVER (
      PARTITION BY st.teacher_user_id
      ORDER BY st.created_at DESC, st.school_id DESC
    ) AS membership_rank
  FROM public.school_teachers st
)
INSERT INTO public.teacher_school_membership_dedup_audit (
  teacher_user_id,
  removed_school_id,
  kept_school_id,
  removed_created_at
)
SELECT
  teacher_user_id,
  school_id,
  kept_school_id,
  created_at
FROM ranked
WHERE membership_rank > 1
ON CONFLICT (teacher_user_id, removed_school_id) DO NOTHING;

DELETE FROM public.school_teachers st
USING (
  SELECT school_id, teacher_user_id
  FROM (
    SELECT
      school_id,
      teacher_user_id,
      row_number() OVER (
        PARTITION BY teacher_user_id
        ORDER BY created_at DESC, school_id DESC
      ) AS membership_rank
    FROM public.school_teachers
  ) ranked
  WHERE membership_rank > 1
) duplicate
WHERE st.school_id = duplicate.school_id
  AND st.teacher_user_id = duplicate.teacher_user_id;

CREATE UNIQUE INDEX school_teachers_one_school_per_teacher
  ON public.school_teachers (teacher_user_id);

-- Normalize the legacy primary-teacher fields so older readers stay aligned
-- while they are migrated to school_teachers. Existing primaries are retained
-- where possible; otherwise the earliest current member becomes primary.
WITH ranked AS (
  SELECT
    school_id,
    teacher_user_id,
    row_number() OVER (
      PARTITION BY school_id
      ORDER BY (teacher_role = 'primary') DESC, created_at ASC, teacher_user_id ASC
    ) AS school_rank
  FROM public.school_teachers
)
UPDATE public.school_teachers st
SET teacher_role = CASE WHEN ranked.school_rank = 1 THEN 'primary' ELSE 'assistant' END
FROM ranked
WHERE st.school_id = ranked.school_id
  AND st.teacher_user_id = ranked.teacher_user_id;

UPDATE public.schools s
SET teacher_user_id = primary_teacher.teacher_user_id
FROM (
  SELECT school_id, teacher_user_id
  FROM public.school_teachers
  WHERE teacher_role = 'primary'
) primary_teacher
WHERE s.id = primary_teacher.school_id;

UPDATE public.schools s
SET teacher_user_id = NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM public.school_teachers st
  WHERE st.school_id = s.id
    AND st.teacher_role = 'primary'
);

CREATE OR REPLACE FUNCTION public.set_teacher_school_assignment(
  p_teacher_user_id uuid,
  p_school_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected_school_ids text[];
  v_school_id text;
  v_primary_teacher_id uuid;
BEGIN
  -- Serialize concurrent edits for the same teacher before the unique index is
  -- reached, producing a predictable move rather than an insert race.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_teacher_user_id::text, 0));

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_teacher_user_id
  ) THEN
    RAISE EXCEPTION 'Teacher account not found';
  END IF;

  IF p_school_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.schools s
    WHERE s.id = p_school_id
  ) THEN
    RAISE EXCEPTION 'School not found';
  END IF;

  -- Saving unrelated account fields must not recreate an unchanged
  -- membership, reset its created_at, or alter its primary/assistant role.
  IF p_school_id IS NULL AND NOT EXISTS (
    SELECT 1
    FROM public.school_teachers st
    WHERE st.teacher_user_id = p_teacher_user_id
  ) THEN
    RETURN;
  END IF;

  IF p_school_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.school_teachers st
      WHERE st.teacher_user_id = p_teacher_user_id
        AND st.school_id = p_school_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.school_teachers st
      WHERE st.teacher_user_id = p_teacher_user_id
        AND st.school_id <> p_school_id
    )
  THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT affected.school_id)
  INTO v_affected_school_ids
  FROM (
    SELECT st.school_id
    FROM public.school_teachers st
    WHERE st.teacher_user_id = p_teacher_user_id
    UNION ALL
    SELECT p_school_id
    WHERE p_school_id IS NOT NULL
  ) affected;

  DELETE FROM public.school_teachers
  WHERE teacher_user_id = p_teacher_user_id;

  IF p_school_id IS NOT NULL THEN
    INSERT INTO public.school_teachers (
      school_id,
      teacher_user_id,
      teacher_role
    )
    VALUES (
      p_school_id,
      p_teacher_user_id,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.school_teachers WHERE school_id = p_school_id
        ) THEN 'assistant'
        ELSE 'primary'
      END
    );
  END IF;

  FOREACH v_school_id IN ARRAY coalesce(v_affected_school_ids, ARRAY[]::text[])
  LOOP
    SELECT st.teacher_user_id
    INTO v_primary_teacher_id
    FROM public.school_teachers st
    WHERE st.school_id = v_school_id
    ORDER BY
      (st.teacher_role = 'primary') DESC,
      st.created_at ASC,
      st.teacher_user_id ASC
    LIMIT 1;

    UPDATE public.school_teachers
    SET teacher_role = CASE
      WHEN teacher_user_id = v_primary_teacher_id THEN 'primary'
      ELSE 'assistant'
    END
    WHERE school_id = v_school_id;

    UPDATE public.schools
    SET teacher_user_id = v_primary_teacher_id
    WHERE id = v_school_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.set_teacher_school_assignment(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_teacher_school_assignment(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.set_teacher_school_assignment(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_teacher_school_assignment(uuid, text) TO service_role;
