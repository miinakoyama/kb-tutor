import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";

// Insights API — answers the four product research questions in one trip:
//   Q2: Does scaffolding actually correct errors? (practice first vs final)
//   Q3: Do students understand or rely on scaffolding? (practice vs exam)
//   Q4: Is the review-mode router delivering struggling students? (errors vs dwell)
//   Q5: Where do students drop off? (stage started/completed/abandoned + session length)
//
// Everything is aggregated in Node after three Supabase round-trips:
//   - public.attempts                  (for Q2, Q3)
//   - public.analytics_events          (for Q4, Q5)
//   - public.analytics_sessions        (for Q5 session duration)
//
// Result size is bounded by date window + a defensive row cap.

type AttemptRow = {
  user_id: string;
  question_id: string;
  mode: string;
  is_correct: boolean;
  standard_id: string | null;
  standard_label: string | null;
  answered_at: string;
};

type EventRow = {
  id: string;
  event_type: string;
  user_id: string;
  session_id: string | null;
  occurred_at: string;
  mode: string | null;
  payload: Record<string, unknown> | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  mode: string;
  started_at: string;
  ended_at: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  student_id: string | null;
};

const MAX_ATTEMPTS = 100_000;
const MAX_EVENTS = 100_000;
const MAX_SESSIONS = 20_000;

// Minimum practice errors a student must accumulate before we count them as
// "should have ended up in review mode". Keeps the Q4 routing signal from being
// dominated by students who made one tiny mistake.
const REVIEW_ERROR_THRESHOLD = 2;

async function requireAdmin() {
  const requester = await createSupabaseServerClient();
  const {
    data: { user },
  } = await requester.auth.getUser();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const { data: profile } = await requester
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, profile?.role);
  if (role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, userId: user.id };
}

function parseWindow(url: URL) {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(now.getDate() - 30);

  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const from = fromRaw ? new Date(fromRaw) : defaultFrom;
  const to = toRaw ? new Date(toRaw) : now;
  // If only a date portion was given we treat `to` as inclusive end of day.
  if (toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
    to.setHours(23, 59, 59, 999);
  }
  return { from, to };
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}

function median(sorted: number[]): number | null {
  return percentile(sorted, 0.5);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Q2 / Q3 — scaffolding effectiveness and practice-vs-exam understanding
// ---------------------------------------------------------------------------

type StandardBucket = {
  standardId: string;
  standardLabel: string;
  firstAttempts: number;
  firstCorrect: number;
  finalAttempts: number;
  finalCorrect: number;
  examAttempts: number;
  examCorrect: number;
  worked: number; // first wrong → final correct
  failed: number; // first wrong → final wrong
  firstTryRight: number; // first correct
};

type StudentBucket = StandardBucket & {
  userId: string;
};

function createStandardBucket(standardId: string, standardLabel: string): StandardBucket {
  return {
    standardId,
    standardLabel,
    firstAttempts: 0,
    firstCorrect: 0,
    finalAttempts: 0,
    finalCorrect: 0,
    examAttempts: 0,
    examCorrect: 0,
    worked: 0,
    failed: 0,
    firstTryRight: 0,
  };
}

function processAttempts(attempts: AttemptRow[]) {
  // Group by (user, question, mode) → ordered list of attempts.
  const groups = new Map<string, AttemptRow[]>();
  for (const row of attempts) {
    const key = `${row.user_id}|${row.question_id}|${row.mode}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const overall = createStandardBucket("_overall", "All");
  const byStandard = new Map<string, StandardBucket>();
  const byStudent = new Map<string, StudentBucket>();

  for (const group of groups.values()) {
    group.sort((a, b) => a.answered_at.localeCompare(b.answered_at));
    const first = group[0];
    const final = group[group.length - 1];
    const mode = first.mode;
    const standardId = first.standard_id ?? "_unknown";
    const standardLabel = first.standard_label ?? standardId;

    const standardBucket =
      byStandard.get(standardId) ??
      createStandardBucket(standardId, standardLabel);
    byStandard.set(standardId, standardBucket);

    const studentKey = first.user_id;
    const studentBucket =
      byStudent.get(studentKey) ??
      ({ ...createStandardBucket("_all", "All"), userId: studentKey } as StudentBucket);
    byStudent.set(studentKey, studentBucket);

    if (mode === "practice") {
      overall.firstAttempts += 1;
      standardBucket.firstAttempts += 1;
      studentBucket.firstAttempts += 1;
      if (first.is_correct) {
        overall.firstCorrect += 1;
        standardBucket.firstCorrect += 1;
        studentBucket.firstCorrect += 1;
      }
      overall.finalAttempts += 1;
      standardBucket.finalAttempts += 1;
      studentBucket.finalAttempts += 1;
      if (final.is_correct) {
        overall.finalCorrect += 1;
        standardBucket.finalCorrect += 1;
        studentBucket.finalCorrect += 1;
      }
      if (first.is_correct) {
        overall.firstTryRight += 1;
        standardBucket.firstTryRight += 1;
        studentBucket.firstTryRight += 1;
      } else if (final.is_correct) {
        overall.worked += 1;
        standardBucket.worked += 1;
        studentBucket.worked += 1;
      } else {
        overall.failed += 1;
        standardBucket.failed += 1;
        studentBucket.failed += 1;
      }
    } else if (mode === "exam") {
      overall.examAttempts += 1;
      standardBucket.examAttempts += 1;
      studentBucket.examAttempts += 1;
      if (final.is_correct) {
        overall.examCorrect += 1;
        standardBucket.examCorrect += 1;
        studentBucket.examCorrect += 1;
      }
    }
  }

  return { overall, byStandard, byStudent };
}

// ---------------------------------------------------------------------------
// Q4 — review routing: practice errors vs review dwell time
// ---------------------------------------------------------------------------

function computeReviewRouting(events: EventRow[]) {
  // Pair review_mode_entered/_exited by session_id and sum up dwell per user.
  const entries = new Map<string, number>();
  const dwellByUser = new Map<string, number>();

  for (const event of events) {
    if (!event.session_id) continue;
    if (event.event_type === "review_mode_entered") {
      entries.set(event.session_id, new Date(event.occurred_at).getTime());
    } else if (event.event_type === "review_mode_exited") {
      const started = entries.get(event.session_id);
      if (started === undefined) continue;
      const ms = new Date(event.occurred_at).getTime() - started;
      entries.delete(event.session_id);
      if (ms <= 0 || ms > 6 * 60 * 60 * 1000) continue; // cap at 6h
      dwellByUser.set(
        event.user_id,
        (dwellByUser.get(event.user_id) ?? 0) + ms,
      );
    }
  }

  // Fallback: users who opened review_item events but never had a clean
  // entered/exited pair still count as "entered" — we just cannot measure
  // their dwell.
  const reviewEnteredUsers = new Set<string>(dwellByUser.keys());
  for (const event of events) {
    if (event.event_type === "review_mode_entered" || event.event_type === "review_item_opened") {
      reviewEnteredUsers.add(event.user_id);
    }
  }

  return { dwellByUser, reviewEnteredUsers };
}

// ---------------------------------------------------------------------------
// Q5 — completion, abandonment, session duration
// ---------------------------------------------------------------------------

type StageCounter = { started: number; completed: number; abandoned: number };

function createStageCounter(): StageCounter {
  return { started: 0, completed: 0, abandoned: 0 };
}

function computeCompletion(events: EventRow[], sessions: SessionRow[]) {
  const overall = createStageCounter();
  const byMode = new Map<string, StageCounter>();
  const byUser = new Map<string, StageCounter>();

  for (const event of events) {
    const mode = event.mode ?? "unknown";
    const modeBucket = byMode.get(mode) ?? createStageCounter();
    byMode.set(mode, modeBucket);
    const userBucket = byUser.get(event.user_id) ?? createStageCounter();
    byUser.set(event.user_id, userBucket);

    if (event.event_type === "stage_started") {
      overall.started += 1;
      modeBucket.started += 1;
      userBucket.started += 1;
    } else if (event.event_type === "stage_completed") {
      overall.completed += 1;
      modeBucket.completed += 1;
      userBucket.completed += 1;
    } else if (event.event_type === "stage_abandoned") {
      overall.abandoned += 1;
      modeBucket.abandoned += 1;
      userBucket.abandoned += 1;
    }
  }

  // Session durations (minutes) grouped by mode.
  const durationsByMode = new Map<string, number[]>();
  for (const session of sessions) {
    if (!session.ended_at) continue;
    const ms = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
    if (ms <= 0 || ms > 6 * 60 * 60 * 1000) continue;
    const minutes = ms / 60_000;
    const list = durationsByMode.get(session.mode) ?? [];
    list.push(minutes);
    durationsByMode.set(session.mode, list);
  }

  return { overall, byMode, byUser, durationsByMode };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const { from, to } = parseWindow(url);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const admin = createSupabaseAdminClient();

  const attemptsPromise = admin
    .from("attempts")
    .select("user_id,question_id,mode,is_correct,standard_id,standard_label,answered_at")
    .gte("answered_at", fromIso)
    .lte("answered_at", toIso)
    .in("mode", ["practice", "exam"])
    .order("answered_at", { ascending: true })
    .limit(MAX_ATTEMPTS);

  const eventsPromise = admin
    .from("analytics_events")
    .select("id,event_type,user_id,session_id,occurred_at,mode,payload")
    .gte("occurred_at", fromIso)
    .lte("occurred_at", toIso)
    .in("event_type", [
      "stage_started",
      "stage_completed",
      "stage_abandoned",
      "review_mode_entered",
      "review_mode_exited",
      "review_item_opened",
    ])
    .order("occurred_at", { ascending: true })
    .limit(MAX_EVENTS);

  const sessionsPromise = admin
    .from("analytics_sessions")
    .select("id,user_id,mode,started_at,ended_at")
    .gte("started_at", fromIso)
    .lte("started_at", toIso)
    .limit(MAX_SESSIONS);

  const [attemptsRes, eventsRes, sessionsRes] = await Promise.all([
    attemptsPromise,
    eventsPromise,
    sessionsPromise,
  ]);

  if (attemptsRes.error) {
    return NextResponse.json({ error: attemptsRes.error.message }, { status: 400 });
  }
  if (eventsRes.error) {
    return NextResponse.json({ error: eventsRes.error.message }, { status: 400 });
  }
  if (sessionsRes.error) {
    return NextResponse.json({ error: sessionsRes.error.message }, { status: 400 });
  }

  const attempts = (attemptsRes.data ?? []) as AttemptRow[];
  const events = (eventsRes.data ?? []) as EventRow[];
  const sessions = (sessionsRes.data ?? []) as SessionRow[];
  const truncated =
    attempts.length >= MAX_ATTEMPTS ||
    events.length >= MAX_EVENTS ||
    sessions.length >= MAX_SESSIONS;

  const scaffolding = processAttempts(attempts);
  const review = computeReviewRouting(events);
  const completion = computeCompletion(events, sessions);

  // ---- Profile lookup for any user that appears in the result -------------
  const userIds = new Set<string>();
  scaffolding.byStudent.forEach((_, key) => userIds.add(key));
  review.dwellByUser.forEach((_, key) => userIds.add(key));
  review.reviewEnteredUsers.forEach((id) => userIds.add(id));
  completion.byUser.forEach((_, key) => userIds.add(key));

  let profileMap = new Map<string, ProfileRow>();
  if (userIds.size > 0) {
    const { data: profileRows } = await admin
      .from("profiles")
      .select("id,display_name,student_id")
      .in("id", Array.from(userIds));
    profileMap = new Map(
      (profileRows as ProfileRow[] | null | undefined ?? []).map((row) => [row.id, row]),
    );
  }

  function displayNameFor(id: string): string {
    const p = profileMap.get(id);
    return p?.display_name || p?.student_id || id.slice(0, 8);
  }

  // ---- Q2 scaffolding payload --------------------------------------------
  const accuracyOrZero = (correct: number, total: number) =>
    total > 0 ? correct / total : 0;

  const scaffoldingOverall = {
    firstAttemptAccuracy: accuracyOrZero(scaffolding.overall.firstCorrect, scaffolding.overall.firstAttempts),
    finalAccuracy: accuracyOrZero(scaffolding.overall.finalCorrect, scaffolding.overall.finalAttempts),
    uplift:
      accuracyOrZero(scaffolding.overall.finalCorrect, scaffolding.overall.finalAttempts) -
      accuracyOrZero(scaffolding.overall.firstCorrect, scaffolding.overall.firstAttempts),
    worked: scaffolding.overall.worked,
    failed: scaffolding.overall.failed,
    firstTryRight: scaffolding.overall.firstTryRight,
    cohortSize: scaffolding.overall.firstAttempts,
  };

  const scaffoldingByStandard = Array.from(scaffolding.byStandard.values())
    .filter((b) => b.firstAttempts >= 5) // hide noisy rows
    .map((b) => ({
      standardId: b.standardId,
      standardLabel: b.standardLabel,
      firstAttemptAccuracy: accuracyOrZero(b.firstCorrect, b.firstAttempts),
      finalAccuracy: accuracyOrZero(b.finalCorrect, b.finalAttempts),
      uplift:
        accuracyOrZero(b.finalCorrect, b.finalAttempts) -
        accuracyOrZero(b.firstCorrect, b.firstAttempts),
      worked: b.worked,
      failed: b.failed,
      cohortSize: b.firstAttempts,
    }))
    .sort((a, b) => a.uplift - b.uplift); // surface worst-uplift standards first

  const scaffoldingByStudent = Array.from(scaffolding.byStudent.values())
    .filter((b) => b.firstAttempts >= 3)
    .map((b) => ({
      userId: b.userId,
      displayName: displayNameFor(b.userId),
      firstAttemptAccuracy: accuracyOrZero(b.firstCorrect, b.firstAttempts),
      finalAccuracy: accuracyOrZero(b.finalCorrect, b.finalAttempts),
      uplift:
        accuracyOrZero(b.finalCorrect, b.finalAttempts) -
        accuracyOrZero(b.firstCorrect, b.firstAttempts),
      worked: b.worked,
      failed: b.failed,
      cohortSize: b.firstAttempts,
    }))
    .sort((a, b) => b.failed - a.failed) // students with the most "still wrong after scaffolding" rise
    .slice(0, 50);

  // ---- Q3 practice vs exam payload ---------------------------------------
  const pve = {
    overall: {
      practiceAccuracy: accuracyOrZero(scaffolding.overall.finalCorrect, scaffolding.overall.finalAttempts),
      examAccuracy: accuracyOrZero(scaffolding.overall.examCorrect, scaffolding.overall.examAttempts),
      gap:
        accuracyOrZero(scaffolding.overall.finalCorrect, scaffolding.overall.finalAttempts) -
        accuracyOrZero(scaffolding.overall.examCorrect, scaffolding.overall.examAttempts),
      practiceN: scaffolding.overall.finalAttempts,
      examN: scaffolding.overall.examAttempts,
    },
    byStandard: Array.from(scaffolding.byStandard.values())
      .filter((b) => b.finalAttempts >= 3 && b.examAttempts >= 3)
      .map((b) => ({
        standardId: b.standardId,
        standardLabel: b.standardLabel,
        practiceAccuracy: accuracyOrZero(b.finalCorrect, b.finalAttempts),
        examAccuracy: accuracyOrZero(b.examCorrect, b.examAttempts),
        gap:
          accuracyOrZero(b.finalCorrect, b.finalAttempts) -
          accuracyOrZero(b.examCorrect, b.examAttempts),
        practiceN: b.finalAttempts,
        examN: b.examAttempts,
      }))
      .sort((a, b) => b.gap - a.gap), // biggest reliance first
    byStudent: Array.from(scaffolding.byStudent.values())
      .filter((b) => b.finalAttempts >= 3 && b.examAttempts >= 3)
      .map((b) => ({
        userId: b.userId,
        displayName: displayNameFor(b.userId),
        practiceAccuracy: accuracyOrZero(b.finalCorrect, b.finalAttempts),
        examAccuracy: accuracyOrZero(b.examCorrect, b.examAttempts),
        gap:
          accuracyOrZero(b.finalCorrect, b.finalAttempts) -
          accuracyOrZero(b.examCorrect, b.examAttempts),
        practiceN: b.finalAttempts,
        examN: b.examAttempts,
      }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 50),
  };

  // ---- Q4 review routing payload -----------------------------------------
  const practiceErrorsByUser = new Map<string, number>();
  scaffolding.byStudent.forEach((bucket, userId) => {
    // "failed" = first wrong AND final wrong. These are the misses that
    // scaffolding could not rescue — exactly the students we hope land in
    // review mode.
    practiceErrorsByUser.set(userId, bucket.failed);
  });

  const scatterStudents = new Set<string>([
    ...practiceErrorsByUser.keys(),
    ...review.reviewEnteredUsers,
  ]);

  const scatter = Array.from(scatterStudents).map((userId) => {
    const errors = practiceErrorsByUser.get(userId) ?? 0;
    const dwellMs = review.dwellByUser.get(userId) ?? 0;
    return {
      userId,
      displayName: displayNameFor(userId),
      practiceErrors: errors,
      reviewMinutes: Math.round((dwellMs / 60_000) * 10) / 10,
      enteredReview: review.reviewEnteredUsers.has(userId),
    };
  });

  const strugglers = scatter.filter((row) => row.practiceErrors >= REVIEW_ERROR_THRESHOLD);
  const strugglersInReview = strugglers.filter((row) => row.enteredReview);
  const strugglersNoReview = strugglers.filter((row) => !row.enteredReview);
  const reviewDwellValues = Array.from(review.dwellByUser.values()).map((ms) => ms / 60_000);

  const reviewRouting = {
    overall: {
      studentsWithErrors: strugglers.length,
      errorThreshold: REVIEW_ERROR_THRESHOLD,
      studentsEnteredReview: review.reviewEnteredUsers.size,
      strugglersInReview: strugglersInReview.length,
      strugglersNoReview: strugglersNoReview.length,
      avgReviewMinutes: mean(reviewDwellValues),
      medianReviewMinutes: median([...reviewDwellValues].sort((a, b) => a - b)),
    },
    scatter: scatter.sort((a, b) => b.practiceErrors - a.practiceErrors).slice(0, 100),
    strugglersNoReview: strugglersNoReview
      .sort((a, b) => b.practiceErrors - a.practiceErrors)
      .slice(0, 20),
  };

  // ---- Q5 completion payload ---------------------------------------------
  const completionOverall = {
    started: completion.overall.started,
    completed: completion.overall.completed,
    abandoned: completion.overall.abandoned,
    completionRate:
      completion.overall.started > 0
        ? completion.overall.completed / completion.overall.started
        : 0,
  };

  const completionByMode = Object.fromEntries(
    Array.from(completion.byMode.entries()).map(([mode, counter]) => {
      const durations = (completion.durationsByMode.get(mode) ?? []).slice().sort((a, b) => a - b);
      return [
        mode,
        {
          started: counter.started,
          completed: counter.completed,
          abandoned: counter.abandoned,
          completionRate: counter.started > 0 ? counter.completed / counter.started : 0,
          avgSessionMin: mean(durations),
          medianSessionMin: median(durations),
          sessions: durations.length,
        },
      ];
    }),
  );

  const completionByStudent = Array.from(completion.byUser.entries())
    .filter(([, counter]) => counter.started >= 2)
    .map(([userId, counter]) => ({
      userId,
      displayName: displayNameFor(userId),
      started: counter.started,
      completed: counter.completed,
      abandoned: counter.abandoned,
      completionRate: counter.started > 0 ? counter.completed / counter.started : 0,
    }))
    .sort((a, b) => a.completionRate - b.completionRate)
    .slice(0, 50);

  return NextResponse.json({
    meta: {
      from: fromIso,
      to: toIso,
      totalAttempts: attempts.length,
      totalEvents: events.length,
      totalSessions: sessions.length,
      truncated,
    },
    scaffolding: {
      overall: scaffoldingOverall,
      byStandard: scaffoldingByStandard,
      byStudent: scaffoldingByStudent,
    },
    practiceVsExam: pve,
    reviewRouting,
    completion: {
      overall: completionOverall,
      byMode: completionByMode,
      byStudent: completionByStudent,
    },
  });
}
