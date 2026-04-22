import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import {
  parseAnalyticsWindow,
  parseSchoolIds,
} from "@/lib/analytics/admin-filters";

// Insights API — answers the four product research questions at a glance:
//   Q2: Does scaffolding actually correct errors? (practice first vs final)
//   Q3: Do students understand or rely on scaffolding? (practice vs exam)
//   Q4: Is the review-mode router delivering struggling students? (errors vs dwell)
//   Q5: Where do students drop off? (stage started/completed/abandoned + session length)
//
// Heavy aggregation lives in Postgres RPCs (see 20260425000000_insights_rpc_functions.sql).
// This route issues 6 parallel RPC calls that return already-grouped rows, then performs
// cheap rollups (overall / by standard / by student) in Node. Raw attempts or events are
// never shipped over the wire.

type PracticeSummaryRow = {
  user_id: string;
  question_id: string;
  standard_id: string | null;
  standard_label: string | null;
  first_is_correct: boolean;
  final_is_correct: boolean;
  attempt_count: number;
};

type ExamSummaryRow = {
  user_id: string;
  question_id: string;
  standard_id: string | null;
  standard_label: string | null;
  is_correct: boolean;
};

type ReviewDwellRow = {
  user_id: string;
  session_id: string;
  dwell_ms: number;
};

type ReviewEnteredRow = { user_id: string };

type StageCountsRow = {
  user_id: string;
  mode: string;
  started_n: number;
  completed_n: number;
  abandoned_n: number;
};

type SessionDurationSourceRow = {
  user_id: string;
  started_at: string;
  ended_at: string | null;
  mode: string;
};

type SessionDurationRow = {
  mode: string;
  duration_ms: number;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  student_id: string | null;
};

// Minimum practice errors a student must accumulate before we count them as
// "should have ended up in review mode".
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

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.floor((sorted.length - 1) * 0.5)];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Lightweight rollup buckets
// ---------------------------------------------------------------------------

type Bucket = {
  firstAttempts: number; // practice groups
  firstCorrect: number;
  finalAttempts: number;
  finalCorrect: number;
  examAttempts: number;
  examCorrect: number;
  worked: number; // practice: first wrong → final correct
  failed: number; // practice: first wrong → final wrong
  firstTryRight: number; // practice: first correct
  standardId?: string;
  standardLabel?: string;
};

function emptyBucket(): Bucket {
  return {
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

function addPracticeToBucket(bucket: Bucket, row: PracticeSummaryRow) {
  bucket.firstAttempts += 1;
  bucket.finalAttempts += 1;
  if (row.first_is_correct) {
    bucket.firstCorrect += 1;
    bucket.firstTryRight += 1;
  } else if (row.final_is_correct) {
    bucket.worked += 1;
  } else {
    bucket.failed += 1;
  }
  if (row.final_is_correct) bucket.finalCorrect += 1;
}

function addExamToBucket(bucket: Bucket, row: ExamSummaryRow) {
  bucket.examAttempts += 1;
  if (row.is_correct) bucket.examCorrect += 1;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const { from, to } = parseAnalyticsWindow(url, { defaultDays: 30 });
  const schoolIds = parseSchoolIds(url);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const admin = createSupabaseAdminClient();
  const rpcArgs = { p_from: fromIso, p_to: toIso };

  let scopedUserSet: Set<string> | null = null;
  if (schoolIds.length > 0) {
    const { data: memberRows, error: memberError } = await admin
      .from("school_members")
      .select("student_user_id")
      .in("school_id", schoolIds);
    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }
    scopedUserSet = new Set(
      (memberRows ?? []).map((row) => String(row.student_user_id)),
    );
  }

  let confidenceQuery = admin
    .from("analytics_events")
    .select("payload")
    .eq("event_type", "confidence_submitted")
    .gte("occurred_at", fromIso)
    .lte("occurred_at", toIso)
    .limit(100_000);
  let hintOpensQuery = admin
    .from("analytics_events")
    .select("user_id,question_id")
    .eq("event_type", "hint_opened")
    .gte("occurred_at", fromIso)
    .lte("occurred_at", toIso)
    .limit(100_000);
  let attemptEventsQuery = admin
    .from("analytics_events")
    .select("user_id,question_id,payload")
    .eq("event_type", "attempt_submitted")
    .gte("occurred_at", fromIso)
    .lte("occurred_at", toIso)
    .limit(200_000);
  let sessionDurationQuery = admin
    .from("analytics_sessions")
    .select("user_id,started_at,ended_at,mode")
    .gte("started_at", fromIso)
    .lte("started_at", toIso)
    .not("ended_at", "is", null)
    .limit(100_000);
  if (schoolIds.length > 0) {
    confidenceQuery = confidenceQuery.in("school_id", schoolIds);
    hintOpensQuery = hintOpensQuery.in("school_id", schoolIds);
    attemptEventsQuery = attemptEventsQuery.in("school_id", schoolIds);
    sessionDurationQuery = sessionDurationQuery.in("school_id", schoolIds);
  }

  const [
    practiceRes,
    examRes,
    reviewDwellRes,
    reviewEnteredRes,
    stageCountsRes,
    sessionDurationsRawRes,
    confidenceRes,
    hintOpensRes,
    attemptEventsRes,
  ] = await Promise.all([
    admin.rpc("insights_practice_summary", rpcArgs),
    admin.rpc("insights_exam_summary", rpcArgs),
    admin.rpc("insights_review_dwell", rpcArgs),
    admin.rpc("insights_review_entered_users", rpcArgs),
    admin.rpc("insights_stage_counts", rpcArgs),
    sessionDurationQuery,
    confidenceQuery,
    hintOpensQuery,
    attemptEventsQuery,
  ]);

  const firstError = [
    practiceRes,
    examRes,
    reviewDwellRes,
    reviewEnteredRes,
    stageCountsRes,
    sessionDurationsRawRes,
    confidenceRes,
    hintOpensRes,
    attemptEventsRes,
  ].find((r) => r.error);
  if (firstError?.error) {
    return NextResponse.json({ error: firstError.error.message }, { status: 400 });
  }

  const practiceRowsAll = (practiceRes.data ?? []) as PracticeSummaryRow[];
  const examRowsAll = (examRes.data ?? []) as ExamSummaryRow[];
  const reviewDwellRowsAll = (reviewDwellRes.data ?? []) as ReviewDwellRow[];
  const reviewEnteredRowsAll = (reviewEnteredRes.data ?? []) as ReviewEnteredRow[];
  const stageCountsRowsAll = (stageCountsRes.data ?? []) as StageCountsRow[];
  const sessionDurationSourceRows =
    (sessionDurationsRawRes.data ?? []) as SessionDurationSourceRow[];

  const isInScope = (userId: string) =>
    scopedUserSet ? scopedUserSet.has(userId) : true;

  const practiceRows = practiceRowsAll.filter((row) => isInScope(row.user_id));
  const examRows = examRowsAll.filter((row) => isInScope(row.user_id));
  const reviewDwellRows = reviewDwellRowsAll.filter((row) =>
    isInScope(row.user_id),
  );
  const reviewEnteredRows = reviewEnteredRowsAll.filter((row) =>
    isInScope(row.user_id),
  );
  const stageCountsRows = stageCountsRowsAll.filter((row) =>
    isInScope(row.user_id),
  );
  const sessionDurationRows: SessionDurationRow[] = sessionDurationSourceRows
    .filter((row) => isInScope(row.user_id))
    .map((row) => {
      const startedMs = new Date(row.started_at).getTime();
      const endedMs = row.ended_at ? new Date(row.ended_at).getTime() : Number.NaN;
      const valid =
        Number.isFinite(startedMs) &&
        Number.isFinite(endedMs) &&
        endedMs > startedMs &&
        endedMs - startedMs < 6 * 60 * 60 * 1000;
      if (!valid) return null;
      return {
        mode: row.mode,
        duration_ms: endedMs - startedMs,
      };
    })
    .filter((row): row is SessionDurationRow => row !== null);

  // ---- Q2 / Q3 rollups ---------------------------------------------------
  const overall = emptyBucket();
  const byStandard = new Map<string, Bucket>();
  const byStudent = new Map<string, Bucket>();

  function standardBucket(id: string | null, label: string | null): Bucket {
    const key = id ?? "_unknown";
    const existing = byStandard.get(key);
    if (existing) return existing;
    const fresh = emptyBucket();
    fresh.standardId = key;
    fresh.standardLabel = label ?? key;
    byStandard.set(key, fresh);
    return fresh;
  }

  function studentBucket(userId: string): Bucket {
    const existing = byStudent.get(userId);
    if (existing) return existing;
    const fresh = emptyBucket();
    byStudent.set(userId, fresh);
    return fresh;
  }

  for (const row of practiceRows) {
    addPracticeToBucket(overall, row);
    addPracticeToBucket(standardBucket(row.standard_id, row.standard_label), row);
    addPracticeToBucket(studentBucket(row.user_id), row);
  }
  for (const row of examRows) {
    addExamToBucket(overall, row);
    addExamToBucket(standardBucket(row.standard_id, row.standard_label), row);
    addExamToBucket(studentBucket(row.user_id), row);
  }

  // ---- Q4 rollups --------------------------------------------------------
  const dwellByUser = new Map<string, number>();
  for (const row of reviewDwellRows) {
    dwellByUser.set(
      row.user_id,
      (dwellByUser.get(row.user_id) ?? 0) + Number(row.dwell_ms ?? 0),
    );
  }
  const reviewEnteredUsers = new Set<string>();
  for (const row of reviewEnteredRows) reviewEnteredUsers.add(row.user_id);
  for (const userId of dwellByUser.keys()) reviewEnteredUsers.add(userId);

  // ---- Q5 rollups --------------------------------------------------------
  const stageOverall = { started: 0, completed: 0, abandoned: 0 };
  const stageByMode = new Map<string, { started: number; completed: number; abandoned: number }>();
  const stageByUser = new Map<string, { started: number; completed: number; abandoned: number }>();
  for (const row of stageCountsRows) {
    stageOverall.started += row.started_n;
    stageOverall.completed += row.completed_n;
    stageOverall.abandoned += row.abandoned_n;
    const modeBucket =
      stageByMode.get(row.mode) ?? { started: 0, completed: 0, abandoned: 0 };
    modeBucket.started += row.started_n;
    modeBucket.completed += row.completed_n;
    modeBucket.abandoned += row.abandoned_n;
    stageByMode.set(row.mode, modeBucket);
    const userBucket =
      stageByUser.get(row.user_id) ?? { started: 0, completed: 0, abandoned: 0 };
    userBucket.started += row.started_n;
    userBucket.completed += row.completed_n;
    userBucket.abandoned += row.abandoned_n;
    stageByUser.set(row.user_id, userBucket);
  }

  const durationsByMode = new Map<string, number[]>();
  for (const row of sessionDurationRows) {
    const list = durationsByMode.get(row.mode) ?? [];
    list.push(Number(row.duration_ms) / 60_000); // minutes
    durationsByMode.set(row.mode, list);
  }

  // ---- Profile lookup ----------------------------------------------------
  const userIds = new Set<string>();
  byStudent.forEach((_, key) => userIds.add(key));
  dwellByUser.forEach((_, key) => userIds.add(key));
  reviewEnteredUsers.forEach((id) => userIds.add(id));
  stageByUser.forEach((_, key) => userIds.add(key));

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

  // ---- Serialisation helpers --------------------------------------------
  const rate = (num: number, den: number) => (den > 0 ? num / den : 0);

  // ---- Scaffolding (Q2) --------------------------------------------------
  const scaffoldingOverall = {
    firstAttemptAccuracy: rate(overall.firstCorrect, overall.firstAttempts),
    finalAccuracy: rate(overall.finalCorrect, overall.finalAttempts),
    uplift:
      rate(overall.finalCorrect, overall.finalAttempts) -
      rate(overall.firstCorrect, overall.firstAttempts),
    worked: overall.worked,
    failed: overall.failed,
    firstTryRight: overall.firstTryRight,
    cohortSize: overall.firstAttempts,
  };

  const scaffoldingByStandard = Array.from(byStandard.values())
    .filter((b) => b.firstAttempts >= 5)
    .map((b) => ({
      standardId: b.standardId ?? "_unknown",
      standardLabel: b.standardLabel ?? "Unknown",
      firstAttemptAccuracy: rate(b.firstCorrect, b.firstAttempts),
      finalAccuracy: rate(b.finalCorrect, b.finalAttempts),
      uplift:
        rate(b.finalCorrect, b.finalAttempts) - rate(b.firstCorrect, b.firstAttempts),
      worked: b.worked,
      failed: b.failed,
      cohortSize: b.firstAttempts,
    }))
    .sort((a, b) => a.uplift - b.uplift);

  const scaffoldingByStudent = Array.from(byStudent.entries())
    .filter(([, b]) => b.firstAttempts >= 3)
    .map(([userId, b]) => ({
      userId,
      displayName: displayNameFor(userId),
      firstAttemptAccuracy: rate(b.firstCorrect, b.firstAttempts),
      finalAccuracy: rate(b.finalCorrect, b.finalAttempts),
      uplift:
        rate(b.finalCorrect, b.finalAttempts) - rate(b.firstCorrect, b.firstAttempts),
      worked: b.worked,
      failed: b.failed,
      cohortSize: b.firstAttempts,
    }))
    .sort((a, b) => b.failed - a.failed)
    .slice(0, 50);

  // ---- Practice vs exam (Q3) ---------------------------------------------
  const pve = {
    overall: {
      practiceAccuracy: rate(overall.finalCorrect, overall.finalAttempts),
      examAccuracy: rate(overall.examCorrect, overall.examAttempts),
      gap:
        rate(overall.finalCorrect, overall.finalAttempts) -
        rate(overall.examCorrect, overall.examAttempts),
      practiceN: overall.finalAttempts,
      examN: overall.examAttempts,
    },
    byStandard: Array.from(byStandard.values())
      .filter((b) => b.finalAttempts >= 3 && b.examAttempts >= 3)
      .map((b) => ({
        standardId: b.standardId ?? "_unknown",
        standardLabel: b.standardLabel ?? "Unknown",
        practiceAccuracy: rate(b.finalCorrect, b.finalAttempts),
        examAccuracy: rate(b.examCorrect, b.examAttempts),
        gap:
          rate(b.finalCorrect, b.finalAttempts) - rate(b.examCorrect, b.examAttempts),
        practiceN: b.finalAttempts,
        examN: b.examAttempts,
      }))
      .sort((a, b) => b.gap - a.gap),
    byStudent: Array.from(byStudent.entries())
      .filter(([, b]) => b.finalAttempts >= 3 && b.examAttempts >= 3)
      .map(([userId, b]) => ({
        userId,
        displayName: displayNameFor(userId),
        practiceAccuracy: rate(b.finalCorrect, b.finalAttempts),
        examAccuracy: rate(b.examCorrect, b.examAttempts),
        gap:
          rate(b.finalCorrect, b.finalAttempts) - rate(b.examCorrect, b.examAttempts),
        practiceN: b.finalAttempts,
        examN: b.examAttempts,
      }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 50),
  };

  // ---- Review routing (Q4) -----------------------------------------------
  const practiceErrorsByUser = new Map<string, number>();
  byStudent.forEach((bucket, userId) => {
    practiceErrorsByUser.set(userId, bucket.failed);
  });

  const scatterUserIds = new Set<string>([
    ...practiceErrorsByUser.keys(),
    ...reviewEnteredUsers,
  ]);

  const scatter = Array.from(scatterUserIds).map((userId) => {
    const errors = practiceErrorsByUser.get(userId) ?? 0;
    const dwellMs = dwellByUser.get(userId) ?? 0;
    return {
      userId,
      displayName: displayNameFor(userId),
      practiceErrors: errors,
      reviewMinutes: Math.round((dwellMs / 60_000) * 10) / 10,
      enteredReview: reviewEnteredUsers.has(userId),
    };
  });

  const strugglers = scatter.filter((row) => row.practiceErrors >= REVIEW_ERROR_THRESHOLD);
  const strugglersInReview = strugglers.filter((row) => row.enteredReview);
  const strugglersNoReview = strugglers.filter((row) => !row.enteredReview);
  const reviewDwellMinutes = Array.from(dwellByUser.values()).map((ms) => ms / 60_000);
  const sortedDwell = [...reviewDwellMinutes].sort((a, b) => a - b);

  const reviewRouting = {
    overall: {
      studentsWithErrors: strugglers.length,
      errorThreshold: REVIEW_ERROR_THRESHOLD,
      studentsEnteredReview: reviewEnteredUsers.size,
      strugglersInReview: strugglersInReview.length,
      strugglersNoReview: strugglersNoReview.length,
      avgReviewMinutes: mean(reviewDwellMinutes),
      medianReviewMinutes: median(sortedDwell),
    },
    scatter: scatter
      .sort((a, b) => b.practiceErrors - a.practiceErrors)
      .slice(0, 100),
    strugglersNoReview: strugglersNoReview
      .sort((a, b) => b.practiceErrors - a.practiceErrors)
      .slice(0, 20),
  };

  // ---- Completion (Q5) ---------------------------------------------------
  const completionOverall = {
    started: stageOverall.started,
    completed: stageOverall.completed,
    abandoned: stageOverall.abandoned,
    completionRate: rate(stageOverall.completed, stageOverall.started),
  };

  const completionByMode = Object.fromEntries(
    Array.from(stageByMode.entries()).map(([mode, counter]) => {
      const durations = (durationsByMode.get(mode) ?? []).slice().sort((a, b) => a - b);
      return [
        mode,
        {
          started: counter.started,
          completed: counter.completed,
          abandoned: counter.abandoned,
          completionRate: rate(counter.completed, counter.started),
          avgSessionMin: mean(durations),
          medianSessionMin: median(durations),
          sessions: durations.length,
        },
      ];
    }),
  );

  const completionByStudent = Array.from(stageByUser.entries())
    .filter(([, counter]) => counter.started >= 2)
    .map(([userId, counter]) => ({
      userId,
      displayName: displayNameFor(userId),
      started: counter.started,
      completed: counter.completed,
      abandoned: counter.abandoned,
      completionRate: rate(counter.completed, counter.started),
    }))
    .sort((a, b) => a.completionRate - b.completionRate)
    .slice(0, 50);

  // ---- Hint Dependency & Confidence Calibration (new) ------------------
  type AttemptEvent = {
    user_id: string;
    question_id: string | null;
    payload: Record<string, unknown> | null;
  };
  type HintOpen = { user_id: string; question_id: string | null };
  type ConfidenceEvent = { payload: Record<string, unknown> | null };

  const attemptEvents = ((attemptEventsRes.data ?? []) as AttemptEvent[]).filter(
    (row) => isInScope(row.user_id),
  );
  const hintOpens = ((hintOpensRes.data ?? []) as HintOpen[]).filter((row) =>
    isInScope(row.user_id),
  );
  const confidenceEvents = (confidenceRes.data ?? []) as ConfidenceEvent[];

  const hintKeySet = new Set<string>();
  for (const row of hintOpens) {
    if (!row.question_id) continue;
    hintKeySet.add(`${row.user_id}::${row.question_id}`);
  }

  const attemptGroups = new Map<
    string,
    {
      userId: string;
      first: { index: number; correct: boolean } | null;
      final: { index: number; correct: boolean } | null;
    }
  >();
  for (const row of attemptEvents) {
    if (!row.question_id) continue;
    const key = `${row.user_id}::${row.question_id}`;
    const payload = row.payload ?? {};
    const index = typeof payload.attemptIndex === "number" ? payload.attemptIndex : 1;
    const correct = typeof payload.isCorrect === "boolean" ? payload.isCorrect : false;
    const group = attemptGroups.get(key) ?? {
      userId: row.user_id,
      first: null,
      final: null,
    };
    if (!group.first || index < group.first.index) group.first = { index, correct };
    if (!group.final || index > group.final.index) group.final = { index, correct };
    attemptGroups.set(key, group);
  }

  let hintShownN = 0;
  let hintShownAndRecovered = 0;
  let hintShownAndFailed = 0;
  let noHintN = 0;
  let noHintCorrect = 0;
  for (const [key, group] of attemptGroups) {
    if (!group.first || !group.final) continue;
    const hintShown = hintKeySet.has(key);
    if (hintShown) {
      hintShownN += 1;
      if (group.final.correct && !group.first.correct) hintShownAndRecovered += 1;
      if (!group.final.correct) hintShownAndFailed += 1;
    } else {
      noHintN += 1;
      if (group.final.correct) noHintCorrect += 1;
    }
  }

  // Recovery rate = among (hint shown) events that started wrong, how many ended correct.
  const wrongFirstWithHint = hintShownAndRecovered + hintShownAndFailed;
  const hintRecoveryRate =
    wrongFirstWithHint > 0 ? hintShownAndRecovered / wrongFirstWithHint : null;
  const noHintAccuracy = noHintN > 0 ? noHintCorrect / noHintN : null;
  const hintDependencyIndex =
    hintRecoveryRate !== null && noHintAccuracy !== null && noHintAccuracy > 0
      ? hintRecoveryRate / noHintAccuracy
      : null;

  const confidenceMatrix: Record<string, { correct: number; incorrect: number }> = {
    sure: { correct: 0, incorrect: 0 },
    somewhat: { correct: 0, incorrect: 0 },
    not_sure: { correct: 0, incorrect: 0 },
  };
  let confidenceTotal = 0;
  for (const row of confidenceEvents) {
    const payload = row.payload ?? {};
    const level =
      typeof payload.confidenceLevel === "string" ? payload.confidenceLevel : null;
    const isCorrect =
      typeof payload.isCorrect === "boolean" ? payload.isCorrect : null;
    if (!level || isCorrect === null) continue;
    const slot = confidenceMatrix[level] ?? { correct: 0, incorrect: 0 };
    if (isCorrect) slot.correct += 1;
    else slot.incorrect += 1;
    confidenceMatrix[level] = slot;
    confidenceTotal += 1;
  }

  const overconfidentWrong = confidenceMatrix.sure?.incorrect ?? 0;
  const underconfidentRight = confidenceMatrix.not_sure?.correct ?? 0;
  const calibratedRate =
    confidenceTotal > 0
      ? 1 - (overconfidentWrong + underconfidentRight) / confidenceTotal
      : null;

  return NextResponse.json({
    meta: {
      from: fromIso,
      to: toIso,
      // Counts of pre-aggregated rows we pulled — useful for debugging, not the
      // raw event totals the dashboard claims to analyse.
      practiceGroups: practiceRows.length,
      examGroups: examRows.length,
      reviewDwellPairs: reviewDwellRows.length,
      stageUserModes: stageCountsRows.length,
      sessionDurations: sessionDurationRows.length,
      attemptEvents: attemptEvents.length,
      confidenceEvents: confidenceEvents.length,
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
    hintDependency: {
      hintShownN,
      hintRecoveryRate,
      noHintN,
      noHintAccuracy,
      hintDependencyIndex,
      hintShownAndRecovered,
      hintShownAndFailed,
      noHintCorrect,
    },
    confidenceCalibration: {
      total: confidenceTotal,
      matrix: confidenceMatrix,
      overconfidentWrong,
      underconfidentRight,
      calibratedRate,
    },
  });
}
