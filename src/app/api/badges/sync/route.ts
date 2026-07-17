import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStudentUserSettings } from "@/lib/user-settings";
import { syncStudentBadges } from "@/lib/homepage/badges";

/**
 * Called at the end of a practice/exam/review session to surface any badges
 * that became newly earned during that session, for a celebration popup.
 * Reuses the same sync-and-persist logic the homepage uses, so this call is
 * idempotent and safe to fire alongside (or instead of) the homepage's own
 * badge sync — `student_badges` is the single source of truth either way.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { timeZone } = await getStudentUserSettings(supabase);
  const { newlyEarned } = await syncStudentBadges(supabase, user.id, { timeZone });

  return NextResponse.json({
    newlyEarned: newlyEarned.map((badge) => ({
      id: badge.id,
      name: badge.name,
      icon: badge.icon,
    })),
  });
}
