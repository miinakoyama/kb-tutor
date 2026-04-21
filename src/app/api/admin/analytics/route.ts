import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";

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

function parseDateBoundary(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

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

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const schoolId = url.searchParams.get("schoolId");
  const modeFilter = url.searchParams.get("mode");
  const studentFilter = url.searchParams.get("student");
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(now.getDate() - 30);
  const from = parseDateBoundary(url.searchParams.get("from"), defaultFrom);
  const to = parseDateBoundary(url.searchParams.get("to"), now);

  const admin = createSupabaseAdminClient();

  let memberQuery = admin.from("school_members").select("school_id,student_user_id");
  if (schoolId) memberQuery = memberQuery.eq("school_id", schoolId);

  const { data: membershipRows, error: membershipError } = await memberQuery;
  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 400 });
  }

  const rows = membershipRows ?? [];
  const schoolIds = Array.from(new Set(rows.map((row) => row.school_id)));
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

  let attemptsQuery = admin
    .from("attempts")
    .select(
      "user_id,question_id,assignment_id,mode,selected_option_id,is_correct,standard_id,standard_label,time_spent_sec,answered_at",
    )
    .in("user_id", studentIds)
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

  const attempts = (attemptRows ?? []) as AttemptRow[];
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
  const schoolByStudent = new Map(rows.map((row) => [row.student_user_id, row.school_id]));

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
      timeSpentSec: row.time_spent_sec ?? 0,
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

  const attemptsCount = enrichedRows.length;
  const correctCount = enrichedRows.filter((row) => row.isCorrect).length;
  const totalTime = enrichedRows.reduce((sum, row) => sum + row.timeSpentSec, 0);

  return NextResponse.json({
    summary: {
      schools: schoolIds.length,
      students: uniqueProfileIds.length,
      attempts: attemptsCount,
      correctRate: attemptsCount > 0 ? Math.round((correctCount / attemptsCount) * 100) : 0,
      averageTimeSec: attemptsCount > 0 ? Math.round(totalTime / attemptsCount) : 0,
      from: from.toISOString(),
      to: to.toISOString(),
    },
    rows: enrichedRows,
  });
}
