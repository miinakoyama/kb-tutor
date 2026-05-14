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

type ProfileRow = {
  id: string;
  student_id: string | null;
  display_name: string | null;
  email: string | null;
};

type SchoolMemberRow = {
  school_id: string;
  student_user_id: string;
};

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

const PAGE_SIZE = 1000;
const JSON_ROW_LIMIT = 500;
const IN_FILTER_CHUNK_SIZE = 200;
const ALLOWED_MODE_FILTERS = new Set(["practice", "exam", "review"]);

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

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function parseModeFilter(value: string | null): string | null {
  if (!value || value === "all") return null;
  return ALLOWED_MODE_FILTERS.has(value) ? value : null;
}

async function fetchSchoolMembers(
  admin: SupabaseAdminClient,
  schoolIdFilters: string[],
): Promise<{ data: SchoolMemberRow[]; error: string | null }> {
  const data: SchoolMemberRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = admin
      .from("school_members")
      .select("school_id,student_user_id")
      .range(from, from + PAGE_SIZE - 1);
    if (schoolIdFilters.length > 0) {
      query = query.in("school_id", schoolIdFilters);
    }

    const { data: page, error } = await query;
    if (error) return { data: [], error: error.message };
    const rows = (page ?? []) as SchoolMemberRow[];
    data.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }

  return { data, error: null };
}

async function fetchExcludedProfileIds(
  admin: SupabaseAdminClient,
  studentIds: string[],
): Promise<{ data: Set<string>; error: string | null }> {
  const excluded = new Set<string>();

  for (const chunk of chunkArray(studentIds, IN_FILTER_CHUNK_SIZE)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from("profiles")
        .select("id")
        .in("id", chunk)
        .eq("excluded_from_analytics", true)
        .range(from, from + PAGE_SIZE - 1);
      if (error) return { data: new Set(), error: error.message };
      const rows = (data ?? []) as Array<{ id: string }>;
      rows.forEach((row) => excluded.add(String(row.id)));
      if (rows.length < PAGE_SIZE) break;
    }
  }

  return { data: excluded, error: null };
}

async function fetchAttempts(
  admin: SupabaseAdminClient,
  userIds: string[],
  from: Date,
  to: Date,
  modeFilter: string | null,
): Promise<{ data: AttemptRow[]; error: string | null }> {
  const data: AttemptRow[] = [];

  for (const chunk of chunkArray(userIds, IN_FILTER_CHUNK_SIZE)) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      let query = admin
        .from("attempts")
        .select(
          "user_id,question_id,assignment_id,mode,selected_option_id,is_correct,standard_id,standard_label,time_spent_sec,answered_at",
        )
        .in("user_id", chunk)
        .gte("answered_at", from.toISOString())
        .lte("answered_at", to.toISOString())
        .order("answered_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (modeFilter) {
        query = query.eq("mode", modeFilter);
      }

      const { data: page, error } = await query;
      if (error) return { data: [], error: error.message };
      const rows = (page ?? []) as AttemptRow[];
      data.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
  }

  data.sort((a, b) => Date.parse(b.answered_at) - Date.parse(a.answered_at));
  return { data, error: null };
}

async function fetchProfiles(
  admin: SupabaseAdminClient,
  userIds: string[],
): Promise<{ data: ProfileRow[]; error: string | null }> {
  const data: ProfileRow[] = [];
  if (userIds.length === 0) return { data, error: null };

  for (const chunk of chunkArray(userIds, IN_FILTER_CHUNK_SIZE)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page, error } = await admin
        .from("profiles")
        .select("id,student_id,display_name,email")
        .in("id", chunk)
        .range(from, from + PAGE_SIZE - 1);
      if (error) return { data: [], error: error.message };
      const rows = (page ?? []) as ProfileRow[];
      data.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
  }

  return { data, error: null };
}

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const schoolIdFilters = parseSchoolIds(url);
  const modeFilter = parseModeFilter(url.searchParams.get("mode"));
  const studentFilter = url.searchParams.get("student");
  const { from, to } = parseAnalyticsWindow(url, { defaultDays: 30 });

  const admin = createSupabaseAdminClient();

  const { data: membershipRows, error: membershipError } = await fetchSchoolMembers(
    admin,
    schoolIdFilters,
  );
  if (membershipError) {
    return NextResponse.json({ error: membershipError }, { status: 400 });
  }

  const rows = membershipRows ?? [];
  const studentIds = Array.from(new Set(rows.map((row) => row.student_user_id)));

  if (studentIds.length === 0) {
    if (format === "csv") {
      const header = joinCsvRow([
        "school_id",
        "student_id",
        "display_name",
        "email",
        "mode",
        "question_id",
        "selected_option_id",
        "is_correct",
        "standard_id",
        "standard_label",
        "time_spent_sec",
        "answered_at",
      ]);
      return new NextResponse(`${header}\n`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=admin-data-analysis-attempts.csv",
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

  const { data: excludedUserIds, error: excludedProfileError } =
    await fetchExcludedProfileIds(admin, studentIds);
  if (excludedProfileError) {
    return NextResponse.json({ error: excludedProfileError }, { status: 400 });
  }
  const includedStudentIds = studentIds.filter((userId) => !excludedUserIds.has(userId));
  const filteredMembershipRows = rows.filter(
    (row) => !excludedUserIds.has(String(row.student_user_id)),
  );
  const schoolIds = Array.from(new Set(filteredMembershipRows.map((row) => row.school_id)));

  if (includedStudentIds.length === 0) {
    if (format === "csv") {
      const header = joinCsvRow([
        "school_id",
        "student_id",
        "display_name",
        "email",
        "mode",
        "question_id",
        "selected_option_id",
        "is_correct",
        "standard_id",
        "standard_label",
        "time_spent_sec",
        "answered_at",
      ]);
      return new NextResponse(`${header}\n`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=admin-data-analysis-attempts.csv",
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

  const { data: attemptRows, error: attemptError } = await fetchAttempts(
    admin,
    includedStudentIds,
    from,
    to,
    modeFilter,
  );

  if (attemptError) {
    return NextResponse.json({ error: attemptError }, { status: 400 });
  }

  const attempts = dedupeAssignmentExamAttempts((attemptRows ?? []) as AttemptRow[]);
  const filteredByStudent = studentFilter
    ? attempts.filter((row) => row.user_id.includes(studentFilter))
    : attempts;

  const uniqueProfileIds = Array.from(new Set(filteredByStudent.map((row) => row.user_id)));
  const { data: profileRows, error: profileError } = await fetchProfiles(
    admin,
    uniqueProfileIds,
  );

  if (profileError) {
    return NextResponse.json({ error: profileError }, { status: 400 });
  }

  const profileMap = new Map((profileRows as ProfileRow[]).map((row) => [row.id, row]));
  const schoolByStudent = new Map(
    filteredMembershipRows.map((row) => [row.student_user_id, row.school_id]),
  );

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
    const header = joinCsvRow([
      "school_id",
      "student_user_id",
      "student_id",
      "student_name",
      "email",
      "mode",
      "question_id",
      "selected_option_id",
      "is_correct",
      "standard_id",
      "standard_label",
      "time_spent_sec",
      "answered_at",
    ]);
    const body = enrichedRows.map((row) =>
      joinCsvRow([
        row.schoolId,
        row.studentUserId,
        row.studentId,
        row.studentName,
        row.email,
        row.mode,
        row.questionId,
        row.selectedOptionId,
        row.isCorrect,
        row.standardId,
        row.standardLabel,
        row.timeSpentSec,
        row.answeredAt,
      ]),
    );
    return new NextResponse([header, ...body].join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=admin-data-analysis-attempts.csv",
      },
    });
  }

  const visibleRows = enrichedRows.slice(0, JSON_ROW_LIMIT);
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
    rows: visibleRows,
  });
}
