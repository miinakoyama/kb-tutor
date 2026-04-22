import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import {
  parseAnalyticsWindow,
  parseSchoolIds,
} from "@/lib/analytics/admin-filters";

// Overview endpoint for the pilot-monitoring dashboard.
//
// Goals:
//   - Headline counters: active students / attempts / sessions / completion.
//   - Daily trend (one bar per day in window).
//   - Mode mix (practice / exam / review).
//   - Device + browser mix (from analytics_sessions).
//   - Data-quality signals (zero-duration, orphan attempts, unclosed sessions).
//   - Per-student engagement list (one row per enrolled student).
//
// Implementation keeps heavy work in Postgres where cheap (selects with filters)
// and runs in-memory aggregation in Node. For the pilot scale (110 students,
// ~3 days) a single window fetches < 50k rows total so this is safe.

type AttemptRow = {
  user_id: string;
  question_id: string;
  mode: string;
  is_correct: boolean;
  time_spent_sec: number | null;
  answered_at: string;
  client_attempt_id: string | null;
  assignment_id: string | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  mode: string;
  started_at: string;
  ended_at: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
};

type StageEventRow = {
  user_id: string;
  event_type: string;
  mode: string | null;
  occurred_at: string;
};

type SchoolMemberRow = {
  school_id: string;
  student_user_id: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  student_id: string | null;
  email: string | null;
};

export interface OverviewResponse {
  meta: {
    from: string;
    to: string;
    totalStudentsEnrolled: number;
    schools: number;
    generatedAt: string;
  };
  headline: {
    activeStudents: number;
    attempts: number;
    sessions: number;
    totalSessionMinutes: number;
    medianSessionMinutes: number | null;
    stageCompletionRate: number | null;
    scaffoldingUpliftPp: number | null;
    correctRate: number | null;
    medianTimePerQuestionSec: number | null;
  };
  daily: Array<{
    date: string;
    attempts: number;
    activeStudents: number;
    sessions: number;
    medianSessionMinutes: number | null;
    correctRate: number | null;
  }>;
  hourly: Array<{
    hour: number;
    attempts: number;
    activeStudents: number;
  }>;
  modeMix: Array<{ mode: string; attempts: number; sessions: number; minutes: number }>;
  deviceMix: Array<{ deviceType: string; sessions: number; users: number }>;
  browserMix: Array<{ browser: string; sessions: number; users: number }>;
  osMix: Array<{ os: string; sessions: number; users: number }>;
  dataQuality: {
    zeroDurationAttempts: number;
    attemptsWithoutClientId: number;
    unclosedSessions: number;
    shortSessions: number;
    duplicateClientAttemptIds: number;
  };
  engagement: Array<{
    userId: string;
    schoolId: string;
    displayName: string;
    studentId: string;
    email: string;
    attempts: number;
    correctRate: number | null;
    sessions: number;
    sessionMinutes: number;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    modes: { practice: number; exam: number; review: number };
  }>;
}

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const { data: profile } = await supabase
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
  return { ok: true as const };
}

function median(sortedValues: number[]): number | null {
  if (sortedValues.length === 0) return null;
  const mid = Math.floor((sortedValues.length - 1) * 0.5);
  return sortedValues[mid] ?? null;
}

function isoDateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateSpanDays(from: Date, to: Date): string[] {
  const days: string[] = [];
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
    days.push(isoDateOnly(d));
  }
  return days;
}

function escapeCsv(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function joinCsv(values: Array<string | number | boolean | null | undefined>): string {
  return values.map(escapeCsv).join(",");
}

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const { from, to } = parseAnalyticsWindow(url, { defaultDays: 14 });
  const format = url.searchParams.get("format");
  const schoolIdFilters = parseSchoolIds(url);

  const admin = createSupabaseAdminClient();

  // 1. Resolve enrolled students.
  let memberQuery = admin
    .from("school_members")
    .select("school_id,student_user_id");
  if (schoolIdFilters.length > 0) {
    memberQuery = memberQuery.in("school_id", schoolIdFilters);
  }
  const { data: memberRows, error: memberErr } = await memberQuery;
  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 400 });
  }
  const members = (memberRows ?? []) as SchoolMemberRow[];
  const memberUserIds = Array.from(new Set(members.map((m) => m.student_user_id)));
  const schoolByUser = new Map(members.map((m) => [m.student_user_id, m.school_id]));
  const schoolIds = Array.from(new Set(members.map((m) => m.school_id)));

  if (memberUserIds.length === 0) {
    const empty: OverviewResponse = {
      meta: {
        from: from.toISOString(),
        to: to.toISOString(),
        totalStudentsEnrolled: 0,
        schools: 0,
        generatedAt: new Date().toISOString(),
      },
      headline: {
        activeStudents: 0,
        attempts: 0,
        sessions: 0,
        totalSessionMinutes: 0,
        medianSessionMinutes: null,
        stageCompletionRate: null,
        scaffoldingUpliftPp: null,
        correctRate: null,
        medianTimePerQuestionSec: null,
      },
      daily: [],
      hourly: [],
      modeMix: [],
      deviceMix: [],
      browserMix: [],
      osMix: [],
      dataQuality: {
        zeroDurationAttempts: 0,
        attemptsWithoutClientId: 0,
        unclosedSessions: 0,
        shortSessions: 0,
        duplicateClientAttemptIds: 0,
      },
      engagement: [],
    };
    return NextResponse.json(empty);
  }

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  // 2. Parallel fetch of attempts / sessions / stage events / profiles.
  const [attemptsRes, sessionsRes, stageRes, profilesRes] = await Promise.all([
    admin
      .from("attempts")
      .select(
        "user_id,question_id,mode,is_correct,time_spent_sec,answered_at,client_attempt_id,assignment_id",
      )
      .in("user_id", memberUserIds)
      .gte("answered_at", fromIso)
      .lte("answered_at", toIso)
      .limit(200_000),
    admin
      .from("analytics_sessions")
      .select("id,user_id,mode,started_at,ended_at,device_type,browser,os")
      .in("user_id", memberUserIds)
      .gte("started_at", fromIso)
      .lte("started_at", toIso)
      .limit(50_000),
    admin
      .from("analytics_events")
      .select("user_id,event_type,mode,occurred_at")
      .in("user_id", memberUserIds)
      .in("event_type", ["stage_started", "stage_completed", "stage_abandoned"])
      .gte("occurred_at", fromIso)
      .lte("occurred_at", toIso)
      .limit(100_000),
    admin
      .from("profiles")
      .select("id,display_name,student_id,email")
      .in("id", memberUserIds),
  ]);

  for (const res of [attemptsRes, sessionsRes, stageRes, profilesRes]) {
    if (res.error) {
      return NextResponse.json({ error: res.error.message }, { status: 400 });
    }
  }

  const attempts = (attemptsRes.data ?? []) as AttemptRow[];
  const sessions = (sessionsRes.data ?? []) as SessionRow[];
  const stageEvents = (stageRes.data ?? []) as StageEventRow[];
  const profileMap = new Map(
    ((profilesRes.data ?? []) as ProfileRow[]).map((row) => [row.id, row]),
  );

  // ---------- Aggregation primitives ---------------------------------------
  const daySet = dateSpanDays(from, to);
  const dayIndex = new Map(daySet.map((d, i) => [d, i]));
  type DailyBucket = {
    attempts: number;
    userIds: Set<string>;
    sessions: number;
    sessionMinutes: number[];
    correct: number;
  };
  const daily: DailyBucket[] = daySet.map(() => ({
    attempts: 0,
    userIds: new Set<string>(),
    sessions: 0,
    sessionMinutes: [],
    correct: 0,
  }));

  const hourlyAttempts = Array.from({ length: 24 }, () => ({
    attempts: 0,
    userIds: new Set<string>(),
  }));

  const modeMix = new Map<
    string,
    { attempts: number; sessions: number; minutes: number }
  >();
  const deviceMix = new Map<string, { sessions: number; users: Set<string> }>();
  const browserMix = new Map<string, { sessions: number; users: Set<string> }>();
  const osMix = new Map<string, { sessions: number; users: Set<string> }>();

  // Attempt-derived totals
  let zeroDurationAttempts = 0;
  let attemptsWithoutClientId = 0;
  const clientIdCounts = new Map<string, number>();
  const durations: number[] = [];
  const userTotals = new Map<
    string,
    {
      attempts: number;
      correct: number;
      sessionMinutes: number;
      sessions: number;
      firstSeen: string | null;
      lastSeen: string | null;
      modes: { practice: number; exam: number; review: number };
    }
  >();

  function ensureUser(userId: string) {
    let row = userTotals.get(userId);
    if (!row) {
      row = {
        attempts: 0,
        correct: 0,
        sessionMinutes: 0,
        sessions: 0,
        firstSeen: null,
        lastSeen: null,
        modes: { practice: 0, exam: 0, review: 0 },
      };
      userTotals.set(userId, row);
    }
    return row;
  }

  // First vs final (user, question) in practice for scaffolding uplift.
  type PracticePair = { first: AttemptRow; last: AttemptRow };
  const practicePairs = new Map<string, PracticePair>();

  for (const row of attempts) {
    const day = isoDateOnly(new Date(row.answered_at));
    const bucketIdx = dayIndex.get(day);
    if (bucketIdx !== undefined) {
      const bucket = daily[bucketIdx];
      bucket.attempts += 1;
      bucket.userIds.add(row.user_id);
      if (row.is_correct) bucket.correct += 1;
    }

    const hour = new Date(row.answered_at).getHours();
    hourlyAttempts[hour].attempts += 1;
    hourlyAttempts[hour].userIds.add(row.user_id);

    const time = row.time_spent_sec ?? 0;
    durations.push(time);
    if (time <= 1) zeroDurationAttempts += 1;
    if (!row.client_attempt_id) attemptsWithoutClientId += 1;
    else {
      clientIdCounts.set(
        row.client_attempt_id,
        (clientIdCounts.get(row.client_attempt_id) ?? 0) + 1,
      );
    }

    const modeRow = modeMix.get(row.mode) ?? { attempts: 0, sessions: 0, minutes: 0 };
    modeRow.attempts += 1;
    modeMix.set(row.mode, modeRow);

    const user = ensureUser(row.user_id);
    user.attempts += 1;
    if (row.is_correct) user.correct += 1;
    if (!user.firstSeen || row.answered_at < user.firstSeen) user.firstSeen = row.answered_at;
    if (!user.lastSeen || row.answered_at > user.lastSeen) user.lastSeen = row.answered_at;
    if (row.mode === "practice") user.modes.practice += 1;
    else if (row.mode === "exam") user.modes.exam += 1;
    else if (row.mode === "review") user.modes.review += 1;

    if (row.mode === "practice") {
      const key = `${row.user_id}::${row.question_id}`;
      const pair = practicePairs.get(key);
      if (!pair) {
        practicePairs.set(key, { first: row, last: row });
      } else {
        if (row.answered_at < pair.first.answered_at) pair.first = row;
        if (row.answered_at > pair.last.answered_at) pair.last = row;
      }
    }
  }

  let duplicateClientAttemptIds = 0;
  for (const count of clientIdCounts.values()) {
    if (count > 1) duplicateClientAttemptIds += count - 1;
  }

  // Session-derived totals
  let unclosedSessions = 0;
  let shortSessions = 0;
  const sessionDurationMinutesAll: number[] = [];
  const now = Date.now();
  const sixHoursMs = 6 * 60 * 60 * 1000;
  for (const sess of sessions) {
    const startedMs = new Date(sess.started_at).getTime();
    const endedMs = sess.ended_at ? new Date(sess.ended_at).getTime() : null;
    const ongoingAndOld = !sess.ended_at && now - startedMs > sixHoursMs;
    if (ongoingAndOld) unclosedSessions += 1;
    const durationMin =
      endedMs !== null && endedMs > startedMs
        ? (endedMs - startedMs) / 60_000
        : null;
    if (durationMin !== null) {
      sessionDurationMinutesAll.push(durationMin);
      if (durationMin < 0.5) shortSessions += 1;
      const modeRow = modeMix.get(sess.mode) ?? { attempts: 0, sessions: 0, minutes: 0 };
      modeRow.sessions += 1;
      modeRow.minutes += durationMin;
      modeMix.set(sess.mode, modeRow);
      const user = ensureUser(sess.user_id);
      user.sessions += 1;
      user.sessionMinutes += durationMin;
    } else {
      const modeRow = modeMix.get(sess.mode) ?? { attempts: 0, sessions: 0, minutes: 0 };
      modeRow.sessions += 1;
      modeMix.set(sess.mode, modeRow);
      const user = ensureUser(sess.user_id);
      user.sessions += 1;
    }
    const day = isoDateOnly(new Date(sess.started_at));
    const bucketIdx = dayIndex.get(day);
    if (bucketIdx !== undefined) {
      daily[bucketIdx].sessions += 1;
      if (durationMin !== null) daily[bucketIdx].sessionMinutes.push(durationMin);
    }
    const deviceKey = sess.device_type || "unknown";
    const browserKey = sess.browser || "Unknown";
    const osKey = sess.os || "Unknown";
    const dRow = deviceMix.get(deviceKey) ?? { sessions: 0, users: new Set<string>() };
    dRow.sessions += 1;
    dRow.users.add(sess.user_id);
    deviceMix.set(deviceKey, dRow);
    const bRow = browserMix.get(browserKey) ?? { sessions: 0, users: new Set<string>() };
    bRow.sessions += 1;
    bRow.users.add(sess.user_id);
    browserMix.set(browserKey, bRow);
    const oRow = osMix.get(osKey) ?? { sessions: 0, users: new Set<string>() };
    oRow.sessions += 1;
    oRow.users.add(sess.user_id);
    osMix.set(osKey, oRow);
  }

  // Stage event counts for completion rate.
  let stageStarted = 0;
  let stageCompleted = 0;
  for (const row of stageEvents) {
    if (row.event_type === "stage_started") stageStarted += 1;
    else if (row.event_type === "stage_completed") stageCompleted += 1;
  }

  // Scaffolding uplift
  let firstCorrect = 0;
  let finalCorrect = 0;
  let practiceN = 0;
  for (const pair of practicePairs.values()) {
    practiceN += 1;
    if (pair.first.is_correct) firstCorrect += 1;
    if (pair.last.is_correct) finalCorrect += 1;
  }

  const sortedDurations = [...durations].sort((a, b) => a - b);
  const medianTimePerQuestionSec = median(sortedDurations);
  const sortedSessionDurations = [...sessionDurationMinutesAll].sort((a, b) => a - b);
  const totalSessionMinutes = sessionDurationMinutesAll.reduce(
    (sum, m) => sum + m,
    0,
  );

  const correctAttempts = attempts.filter((row) => row.is_correct).length;
  const overallCorrectRate =
    attempts.length > 0 ? correctAttempts / attempts.length : null;

  // Daily correct rates (for trend).
  const dailySerialized = daySet.map((date, idx) => {
    const bucket = daily[idx];
    const sorted = [...bucket.sessionMinutes].sort((a, b) => a - b);
    return {
      date,
      attempts: bucket.attempts,
      activeStudents: bucket.userIds.size,
      sessions: bucket.sessions,
      medianSessionMinutes: median(sorted),
      correctRate: bucket.attempts > 0 ? bucket.correct / bucket.attempts : null,
    };
  });

  const hourlySerialized = hourlyAttempts.map((row, hour) => ({
    hour,
    attempts: row.attempts,
    activeStudents: row.userIds.size,
  }));

  const serializeMix = (
    map: Map<string, { sessions: number; users: Set<string> }>,
  ) =>
    Array.from(map.entries())
      .map(([key, value]) => ({
        key,
        sessions: value.sessions,
        users: value.users.size,
      }))
      .sort((a, b) => b.sessions - a.sessions);

  const deviceList = serializeMix(deviceMix).map((row) => ({
    deviceType: row.key,
    sessions: row.sessions,
    users: row.users,
  }));
  const browserList = serializeMix(browserMix).map((row) => ({
    browser: row.key,
    sessions: row.sessions,
    users: row.users,
  }));
  const osList = serializeMix(osMix).map((row) => ({
    os: row.key,
    sessions: row.sessions,
    users: row.users,
  }));

  // Per-student engagement table — union of enrolled students and any user
  // who had activity in the window (so visiting/guest rows aren't silently
  // dropped).
  const engagementUserIds = new Set<string>([
    ...memberUserIds,
    ...userTotals.keys(),
  ]);
  const engagement = Array.from(engagementUserIds).map((userId) => {
    const totals = userTotals.get(userId);
    const profile = profileMap.get(userId);
    return {
      userId,
      schoolId: schoolByUser.get(userId) ?? "",
      displayName: profile?.display_name ?? "",
      studentId: profile?.student_id ?? "",
      email: profile?.email ?? "",
      attempts: totals?.attempts ?? 0,
      correctRate:
        totals && totals.attempts > 0 ? totals.correct / totals.attempts : null,
      sessions: totals?.sessions ?? 0,
      sessionMinutes: totals ? Math.round(totals.sessionMinutes * 10) / 10 : 0,
      firstSeenAt: totals?.firstSeen ?? null,
      lastSeenAt: totals?.lastSeen ?? null,
      modes: totals?.modes ?? { practice: 0, exam: 0, review: 0 },
    };
  });

  const response: OverviewResponse = {
    meta: {
      from: fromIso,
      to: toIso,
      totalStudentsEnrolled: memberUserIds.length,
      schools: schoolIds.length,
      generatedAt: new Date().toISOString(),
    },
    headline: {
      activeStudents: new Set(attempts.map((r) => r.user_id)).size,
      attempts: attempts.length,
      sessions: sessions.length,
      totalSessionMinutes: Math.round(totalSessionMinutes * 10) / 10,
      medianSessionMinutes: median(sortedSessionDurations),
      stageCompletionRate:
        stageStarted > 0 ? stageCompleted / stageStarted : null,
      scaffoldingUpliftPp:
        practiceN > 0 ? (finalCorrect - firstCorrect) / practiceN : null,
      correctRate: overallCorrectRate,
      medianTimePerQuestionSec,
    },
    daily: dailySerialized,
    hourly: hourlySerialized,
    modeMix: Array.from(modeMix.entries())
      .map(([mode, row]) => ({
        mode,
        attempts: row.attempts,
        sessions: row.sessions,
        minutes: Math.round(row.minutes * 10) / 10,
      }))
      .sort((a, b) => b.attempts - a.attempts),
    deviceMix: deviceList,
    browserMix: browserList,
    osMix: osList,
    dataQuality: {
      zeroDurationAttempts,
      attemptsWithoutClientId,
      unclosedSessions,
      shortSessions,
      duplicateClientAttemptIds,
    },
    engagement: engagement.sort((a, b) => b.attempts - a.attempts),
  };

  if (format === "csv") {
    const header = joinCsv([
      "user_id",
      "school_id",
      "display_name",
      "student_id",
      "email",
      "attempts",
      "correct_rate",
      "sessions",
      "session_minutes",
      "practice_attempts",
      "exam_attempts",
      "review_attempts",
      "first_seen_at",
      "last_seen_at",
    ]);
    const lines = engagement.map((row) =>
      joinCsv([
        row.userId,
        row.schoolId,
        row.displayName,
        row.studentId,
        row.email,
        row.attempts,
        row.correctRate !== null ? Math.round(row.correctRate * 10_000) / 100 : "",
        row.sessions,
        row.sessionMinutes,
        row.modes.practice,
        row.modes.exam,
        row.modes.review,
        row.firstSeenAt ?? "",
        row.lastSeenAt ?? "",
      ]),
    );
    return new NextResponse([header, ...lines].join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=admin-data-analysis-overview.csv",
      },
    });
  }

  return NextResponse.json(response);
}
