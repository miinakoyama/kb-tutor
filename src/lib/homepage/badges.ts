import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BADGE_CATALOG } from "@/lib/badges/catalog";
import { evaluateEarnedBadges } from "@/lib/badges/evaluate";
import type { SessionCountAttemptRow } from "@/lib/badges/session-counts";
import type { BadgeDefinition, StudentBadgeView } from "@/types/badges";

export interface BadgeSyncResult {
  badges: StudentBadgeView[];
  /** Badges that became earned during this specific call (not all-time earned). */
  newlyEarned: BadgeDefinition[];
}

/**
 * Computes the student's currently-earned badges, persists any newly-earned
 * ones to `student_badges` (idempotent upsert), and returns the full catalog
 * annotated with earned state plus the subset that was JUST earned by this
 * call. Persistence matters because mastery is not monotonic (a KC's
 * `mastered` flag can flip back to false after a later wrong answer) — once
 * a badge is earned it must not disappear.
 */
export async function syncStudentBadges(
  supabase: SupabaseClient,
  studentUserId: string,
  options: { timeZone: string },
): Promise<BadgeSyncResult> {
  const [attemptRows, masteredKcCodes, previouslyEarned] = await Promise.all([
    fetchAttemptRows(supabase, studentUserId),
    fetchMasteredKcCodes(studentUserId),
    fetchEarnedBadgeRows(supabase, studentUserId),
  ]);

  const currentlyEarned = evaluateEarnedBadges({
    attempts: attemptRows,
    masteredKcCodes,
    timeZone: options.timeZone,
  });

  const newlyEarnedIds = Array.from(currentlyEarned).filter((id) => !previouslyEarned.has(id));
  if (newlyEarnedIds.length > 0) {
    await supabase.from("student_badges").upsert(
      newlyEarnedIds.map((badgeId) => ({ user_id: studentUserId, badge_id: badgeId })),
      { onConflict: "user_id,badge_id", ignoreDuplicates: true },
    );
  }

  const earnedAtByBadgeId = new Map(previouslyEarned);
  const now = new Date().toISOString();
  for (const badgeId of newlyEarnedIds) earnedAtByBadgeId.set(badgeId, now);

  const badges = BADGE_CATALOG.map((badge) => ({
    id: badge.id,
    name: badge.name,
    category: badge.category,
    icon: badge.icon,
    earned: earnedAtByBadgeId.has(badge.id),
    earnedAt: earnedAtByBadgeId.get(badge.id) ?? null,
  }));
  const newlyEarned = BADGE_CATALOG.filter((badge) => newlyEarnedIds.includes(badge.id));

  return { badges, newlyEarned };
}

/**
 * Computes the student's currently-earned badges, persists any newly-earned
 * ones to `student_badges`, and returns the full catalog annotated with
 * earned state. See `syncStudentBadges` for the underlying logic and the
 * `newlyEarned` diff, used elsewhere (e.g. the session-end celebration).
 */
export async function getStudentBadges(
  supabase: SupabaseClient,
  studentUserId: string,
  options: { timeZone: string },
): Promise<StudentBadgeView[]> {
  return (await syncStudentBadges(supabase, studentUserId, options)).badges;
}

async function fetchAttemptRows(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<SessionCountAttemptRow[]> {
  const { data, error } = await supabase
    .from("attempts")
    .select("mode,assignment_id,answered_at")
    .eq("user_id", studentUserId);
  if (error || !data) return [];

  return data.map((row) => ({
    mode: String(row.mode),
    assignmentId:
      row.assignment_id === null || row.assignment_id === undefined ? null : String(row.assignment_id),
    answeredAt: String(row.answered_at),
  }));
}

async function fetchMasteredKcCodes(studentUserId: string): Promise<Set<string>> {
  // student_kc_mastery is queried via the admin client with an explicit
  // user_id filter, matching src/app/api/practice/next/route.ts.
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("student_kc_mastery")
    .select("kc_code,mastered")
    .eq("user_id", studentUserId)
    .eq("mastered", true);
  if (error || !data) return new Set();

  return new Set(data.map((row) => String(row.kc_code)));
}

async function fetchEarnedBadgeRows(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("student_badges")
    .select("badge_id,earned_at")
    .eq("user_id", studentUserId);
  if (error || !data) return new Map();

  return new Map(data.map((row) => [String(row.badge_id), String(row.earned_at)]));
}
