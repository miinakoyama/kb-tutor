import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import {
  parseAnalyticsWindow,
  parseSchoolIds,
} from "@/lib/analytics/admin-filters";
import { dedupeAssignmentExamAttempts } from "@/lib/analytics/exam-attempt-dedupe";

type AttemptRow = {
  user_id: string;
  question_id: string;
  assignment_id: string | null;
  mode: string;
  selected_option_id: string;
  is_correct: boolean;
  standard_id: string | null;
  standard_label: string | null;
  time_spent_sec: number | null;
  answered_at: string;
};

type SessionRow = {
  id: string;
  school_id: string;
  user_id: string;
  mode: string;
  started_at: string;
  ended_at: string | null;
  client_started_at: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  timezone: string | null;
};

type EventRow = {
  school_id: string;
  session_id: string | null;
  user_id: string;
  event_type: string;
  mode: string | null;
  question_id: string | null;
  assignment_id: string | null;
  occurred_at: string;
  payload: Record<string, unknown> | null;
};

type ProfileRow = {
  id: string;
  student_id: string | null;
  display_name: string | null;
  email: string | null;
};

function escapeCsvValue(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function joinCsvRow(columns: Array<string | number | boolean | null>): string {
  return columns.map(escapeCsvValue).join(",");
}

type CsvRecord = {
  recordType: "attempt" | "event" | "session";
  schoolId: string;
  studentUserId: string;
  studentId: string;
  studentName: string;
  email: string;
  mode: string;
  eventType: string;
  questionId: string;
  assignmentId: string;
  selectedOptionId: string;
  isCorrect: boolean | null;
  standardId: string;
  standardLabel: string;
  timeSpentSec: number | null;
  answeredAt: string;
  sessionId: string;
  sessionStartedAt: string;
  sessionEndedAt: string;
  clientStartedAt: string;
  deviceType: string;
  browser: string;
  os: string;
  timezone: string;
  occurredAt: string;
  payloadJson: string;
  payloadFields: Record<string, string | number | boolean | null>;
};

function toCsvScalar(value: unknown): string | number | boolean | null {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  return JSON.stringify(value);
}

function normalizePayloadFields(payload: Record<string, unknown> | null): Record<string, string | number | boolean | null> {
  if (!payload) return {};
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, toCsvScalar(value)]),
  );
}

async function requireAdmin() {
  const requester = await createSupabaseServerClient();
  const {
    data: { user },
  } = await requester.auth.getUser();
  if (!user) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await requester
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, profile?.role);
  if (role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const, userId: user.id };
}

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const schoolIdFilters = parseSchoolIds(url);
  const modeFilter = url.searchParams.get("mode");
  const studentFilter = url.searchParams.get("student");
  const { from, to } = parseAnalyticsWindow(url, { defaultDays: 30 });

  const admin = createSupabaseAdminClient();

  let memberQuery = admin.from("school_members").select("school_id,student_user_id");
  if (schoolIdFilters.length > 0) {
    memberQuery = memberQuery.in("school_id", schoolIdFilters);
  }

  const { data: membershipRows, error: membershipError } = await memberQuery;
  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 400 });
  }

  const rows = membershipRows ?? [];
  const studentIds = Array.from(new Set(rows.map((row) => row.student_user_id)));

  if (studentIds.length === 0) {
    if (format === "csv") {
      const header = joinCsvRow([
        "record_type",
        "school_id",
        "student_user_id",
        "student_id",
        "student_name",
        "email",
        "mode",
        "event_type",
        "question_id",
        "assignment_id",
        "selected_option_id",
        "is_correct",
        "standard_id",
        "standard_label",
        "time_spent_sec",
        "answered_at",
        "session_id",
        "session_started_at",
        "session_ended_at",
        "client_started_at",
        "device_type",
        "browser",
        "os",
        "timezone",
        "occurred_at",
        "payload_json",
      ]);
      return new NextResponse(`${header}\n`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=admin-data-analysis-interactions.csv",
        },
      });
    }
    return NextResponse.json({
      summary: {
        schools: 0,
        students: 0,
        attempts: 0,
        correctRate: 0,
        averageTimeSec: 0,
      },
      rows: [],
    });
  }

  const { data: excludedProfileRows, error: excludedProfileError } = await admin
    .from("profiles")
    .select("id")
    .in("id", studentIds)
    .eq("excluded_from_analytics", true);
  if (excludedProfileError) {
    return NextResponse.json({ error: excludedProfileError.message }, { status: 400 });
  }
  const excludedUserIds = new Set((excludedProfileRows ?? []).map((row) => String(row.id)));
  const includedStudentIds = studentIds.filter((userId) => !excludedUserIds.has(userId));
  const filteredMembershipRows = rows.filter(
    (row) => !excludedUserIds.has(String(row.student_user_id)),
  );
  const schoolIds = Array.from(new Set(filteredMembershipRows.map((row) => row.school_id)));
  const schoolByStudent = new Map(
    filteredMembershipRows.map((row) => [row.student_user_id, row.school_id]),
  );

  if (includedStudentIds.length === 0) {
    if (format === "csv") {
      const header = joinCsvRow([
        "record_type",
        "school_id",
        "student_user_id",
        "student_id",
        "student_name",
        "email",
        "mode",
        "event_type",
        "question_id",
        "assignment_id",
        "selected_option_id",
        "is_correct",
        "standard_id",
        "standard_label",
        "time_spent_sec",
        "answered_at",
        "session_id",
        "session_started_at",
        "session_ended_at",
        "client_started_at",
        "device_type",
        "browser",
        "os",
        "timezone",
        "occurred_at",
        "payload_json",
      ]);
      return new NextResponse(`${header}\n`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=admin-data-analysis-interactions.csv",
        },
      });
    }
    return NextResponse.json({
      summary: {
        schools: 0,
        students: 0,
        attempts: 0,
        correctRate: 0,
        averageTimeSec: 0,
      },
      rows: [],
    });
  }

  let attemptsQuery = admin
    .from("attempts")
    .select(
      "user_id,question_id,assignment_id,mode,selected_option_id,is_correct,standard_id,standard_label,time_spent_sec,answered_at",
    )
    .in("user_id", includedStudentIds)
    .gte("answered_at", from.toISOString())
    .lte("answered_at", to.toISOString())
    .order("answered_at", { ascending: false });

  if (modeFilter) {
    attemptsQuery = attemptsQuery.eq("mode", modeFilter);
  }

  const { data: attemptRows, error: attemptError } = await attemptsQuery.limit(format === "csv" ? 1000000 : 500);

  if (attemptError) {
    return NextResponse.json({ error: attemptError.message }, { status: 400 });
  }

  const attempts = dedupeAssignmentExamAttempts((attemptRows ?? []) as AttemptRow[]);
  const filteredByStudent = studentFilter
    ? attempts.filter((row) => row.user_id.includes(studentFilter))
    : attempts;

  const uniqueProfileIds = Array.from(new Set(filteredByStudent.map((row) => row.user_id)));
  const { data: profileRows, error: profileError } = await admin
    .from("profiles")
    .select("id,student_id,display_name,email")
    .in("id", uniqueProfileIds);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  const profileMap = new Map((profileRows as ProfileRow[]).map((row) => [row.id, row]));
  const enrichedRows = filteredByStudent.map((row) => {
    const profile = profileMap.get(row.user_id);
    return {
      schoolId: schoolByStudent.get(row.user_id) ?? "",
      studentUserId: row.user_id,
      studentId: profile?.student_id ?? "",
      studentName: profile?.display_name ?? "",
      email: profile?.email ?? "",
      mode: row.mode,
      questionId: row.question_id,
      selectedOptionId: row.selected_option_id,
      isCorrect: row.is_correct,
      standardId: row.standard_id ?? "",
      standardLabel: row.standard_label ?? "",
      timeSpentSec:
        typeof row.time_spent_sec === "number" &&
        Number.isFinite(row.time_spent_sec)
          ? row.time_spent_sec
          : null,
      answeredAt: row.answered_at,
    };
  });

  if (format === "csv") {
    let eventsQuery = admin
      .from("analytics_events")
      .select(
        "school_id,session_id,user_id,event_type,mode,question_id,assignment_id,occurred_at,payload",
      )
      .in("user_id", includedStudentIds)
      .gte("occurred_at", from.toISOString())
      .lte("occurred_at", to.toISOString())
      .order("occurred_at", { ascending: false });

    if (modeFilter) {
      eventsQuery = eventsQuery.eq("mode", modeFilter);
    }

    const { data: eventRows, error: eventError } = await eventsQuery.limit(1000000);
    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 400 });
    }

    let sessionsQuery = admin
      .from("analytics_sessions")
      .select(
        "id,school_id,user_id,mode,started_at,ended_at,client_started_at,device_type,browser,os,timezone",
      )
      .in("user_id", includedStudentIds)
      .gte("started_at", from.toISOString())
      .lte("started_at", to.toISOString())
      .order("started_at", { ascending: false });

    if (modeFilter) {
      sessionsQuery = sessionsQuery.eq("mode", modeFilter);
    }

    const { data: sessionRows, error: sessionError } = await sessionsQuery.limit(1000000);
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 400 });
    }

    const events = (eventRows ?? []) as EventRow[];
    const sessions = (sessionRows ?? []) as SessionRow[];
    const filteredEvents = studentFilter
      ? events.filter((row) => row.user_id.includes(studentFilter))
      : events;
    const filteredSessions = studentFilter
      ? sessions.filter((row) => row.user_id.includes(studentFilter))
      : sessions;

    const csvProfileIds = Array.from(
      new Set([
        ...filteredByStudent.map((row) => row.user_id),
        ...filteredEvents.map((row) => row.user_id),
        ...filteredSessions.map((row) => row.user_id),
      ]),
    );

    const { data: csvProfileRows, error: csvProfileError } = await admin
      .from("profiles")
      .select("id,student_id,display_name,email")
      .in("id", csvProfileIds);
    if (csvProfileError) {
      return NextResponse.json({ error: csvProfileError.message }, { status: 400 });
    }
    const csvProfileMap = new Map(
      (csvProfileRows as ProfileRow[]).map((row) => [row.id, row]),
    );

    const csvRecords: CsvRecord[] = [
      ...filteredByStudent.map((row) => {
        const profile = csvProfileMap.get(row.user_id);
        return {
          recordType: "attempt" as const,
          schoolId: schoolByStudent.get(row.user_id) ?? "",
          studentUserId: row.user_id,
          studentId: profile?.student_id ?? "",
          studentName: profile?.display_name ?? "",
          email: profile?.email ?? "",
          mode: row.mode,
          eventType: "",
          questionId: row.question_id,
          assignmentId: row.assignment_id ?? "",
          selectedOptionId: row.selected_option_id,
          isCorrect: row.is_correct,
          standardId: row.standard_id ?? "",
          standardLabel: row.standard_label ?? "",
          timeSpentSec: row.time_spent_sec,
          answeredAt: row.answered_at,
          sessionId: "",
          sessionStartedAt: "",
          sessionEndedAt: "",
          clientStartedAt: "",
          deviceType: "",
          browser: "",
          os: "",
          timezone: "",
          occurredAt: row.answered_at,
          payloadJson: "",
          payloadFields: {},
        };
      }),
      ...filteredEvents.map((row) => {
        const profile = csvProfileMap.get(row.user_id);
        const payloadFields = normalizePayloadFields(row.payload);
        return {
          recordType: "event" as const,
          schoolId: row.school_id ?? schoolByStudent.get(row.user_id) ?? "",
          studentUserId: row.user_id,
          studentId: profile?.student_id ?? "",
          studentName: profile?.display_name ?? "",
          email: profile?.email ?? "",
          mode: row.mode ?? "",
          eventType: row.event_type,
          questionId: row.question_id ?? "",
          assignmentId: row.assignment_id ?? "",
          selectedOptionId: "",
          isCorrect: null,
          standardId: "",
          standardLabel: "",
          timeSpentSec: null,
          answeredAt: "",
          sessionId: row.session_id ?? "",
          sessionStartedAt: "",
          sessionEndedAt: "",
          clientStartedAt: "",
          deviceType: "",
          browser: "",
          os: "",
          timezone: "",
          occurredAt: row.occurred_at,
          payloadJson: row.payload ? JSON.stringify(row.payload) : "",
          payloadFields,
        };
      }),
      ...filteredSessions.map((row) => {
        const profile = csvProfileMap.get(row.user_id);
        return {
          recordType: "session" as const,
          schoolId: row.school_id ?? schoolByStudent.get(row.user_id) ?? "",
          studentUserId: row.user_id,
          studentId: profile?.student_id ?? "",
          studentName: profile?.display_name ?? "",
          email: profile?.email ?? "",
          mode: row.mode,
          eventType: "",
          questionId: "",
          assignmentId: "",
          selectedOptionId: "",
          isCorrect: null,
          standardId: "",
          standardLabel: "",
          timeSpentSec: null,
          answeredAt: "",
          sessionId: row.id,
          sessionStartedAt: row.started_at,
          sessionEndedAt: row.ended_at ?? "",
          clientStartedAt: row.client_started_at ?? "",
          deviceType: row.device_type ?? "",
          browser: row.browser ?? "",
          os: row.os ?? "",
          timezone: row.timezone ?? "",
          occurredAt: row.started_at,
          payloadJson: "",
          payloadFields: {},
        };
      }),
    ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    const payloadKeys = Array.from(
      new Set(
        csvRecords.flatMap((record) =>
          Object.keys(record.payloadFields).map((key) => `payload_${key}`),
        ),
      ),
    ).sort();

    const baseHeader = [
      "record_type",
      "school_id",
      "student_user_id",
      "student_id",
      "student_name",
      "email",
      "mode",
      "event_type",
      "question_id",
      "assignment_id",
      "selected_option_id",
      "is_correct",
      "standard_id",
      "standard_label",
      "time_spent_sec",
      "answered_at",
      "session_id",
      "session_started_at",
      "session_ended_at",
      "client_started_at",
      "device_type",
      "browser",
      "os",
      "timezone",
      "occurred_at",
      "payload_json",
    ];
    const header = joinCsvRow([...baseHeader, ...payloadKeys]);
    const body = csvRecords.map((record) =>
      joinCsvRow([
        record.recordType,
        record.schoolId,
        record.studentUserId,
        record.studentId,
        record.studentName,
        record.email,
        record.mode,
        record.eventType,
        record.questionId,
        record.assignmentId,
        record.selectedOptionId,
        record.isCorrect,
        record.standardId,
        record.standardLabel,
        record.timeSpentSec,
        record.answeredAt,
        record.sessionId,
        record.sessionStartedAt,
        record.sessionEndedAt,
        record.clientStartedAt,
        record.deviceType,
        record.browser,
        record.os,
        record.timezone,
        record.occurredAt,
        record.payloadJson,
        ...payloadKeys.map((key) => record.payloadFields[key.replace("payload_", "")] ?? ""),
      ]),
    );
    return new NextResponse([header, ...body].join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=admin-data-analysis-interactions.csv",
      },
    });
  }

  const attemptsCount = enrichedRows.length;
  const correctCount = enrichedRows.filter((row) => row.isCorrect).length;
  const measuredRows = enrichedRows.filter(
    (row): row is (typeof row & { timeSpentSec: number }) =>
      row.timeSpentSec !== null,
  );
  const totalTime = measuredRows.reduce((sum, row) => sum + row.timeSpentSec, 0);
  const measuredCount = measuredRows.length;

  return NextResponse.json({
    summary: {
      schools: schoolIds.length,
      students: uniqueProfileIds.length,
      attempts: attemptsCount,
      correctRate: attemptsCount > 0 ? Math.round((correctCount / attemptsCount) * 100) : 0,
      averageTimeSec: measuredCount > 0 ? Math.round(totalTime / measuredCount) : 0,
      from: from.toISOString(),
      to: to.toISOString(),
    },
    rows: enrichedRows,
  });
}
