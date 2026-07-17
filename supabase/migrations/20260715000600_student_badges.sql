-- Persisted badge/achievement state. Badges are computed on read (see
-- src/lib/badges/evaluate.ts) and upserted here once earned, so that a
-- badge never disappears even if the underlying signal later becomes false
-- again (e.g. BKT mastery can dip below threshold after a wrong answer).

CREATE TABLE IF NOT EXISTS public.student_badges (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

ALTER TABLE public.student_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY student_badges_scoped_read ON public.student_badges FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR (public.is_teacher() AND public.teacher_can_read_student_profile(user_id)));

REVOKE ALL ON public.student_badges FROM anon, authenticated;
GRANT SELECT ON public.student_badges TO authenticated;
GRANT ALL ON public.student_badges TO service_role;
