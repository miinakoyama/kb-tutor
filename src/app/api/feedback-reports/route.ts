import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRequester, getScopedSchoolIds } from "@/lib/assignments/manage-helpers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NOTE_LENGTH = 1000;
const MAX_LIMIT = 100;
const PREVIEW_LENGTH = 140;

interface ReportRequestBody {
  attemptId: string;
  note?: string;
}

interface ReportAttemptRow {
  id: unknown;
  user_id: unknown;
  question_id: unknown;
  part_label: unknown;
  response_text?: unknown;
  score?: unknown;
  max_score?: unknown;
  feedback?: unknown;
  method?: unknown;
  model_id?: unknown;
  confidence?: unknown;
}

function parseBody(raw: unknown): ReportRequestBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.attemptId !== "string" || !UUID_RE.test(b.attemptId)) {
    return null;
  }
  if (b.note !== undefined && typeof b.note !== "string") return null;
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > MAX_NOTE_LENGTH) return null;
  return {
    attemptId: b.attemptId,
    note: note.length > 0 ? note : undefined,
  };
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  // Resolve the attempt with the admin client so a foreign attempt yields a
  // clear 403 rather than an RLS-shaped 404.
  const admin = createSupabaseAdminClient();
  const { data: attempt } = await admin
    .from("short_answer_attempts")
    .select("id, user_id, question_id, part_label")
    .eq("id", body.attemptId)
    .maybeSingle();
  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }
  if (attempt.user_id !== user.id) {
    return NextResponse.json(
      { error: "You can only report feedback on your own attempts" },
      { status: 403 },
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("feedback_reports")
    .insert({
      student_user_id: user.id,
      attempt_id: attempt.id,
      question_id: attempt.question_id,
      part_label: attempt.part_label,
      note: body.note ?? null,
    })
    .select("id")
    .single();

  if (insertError) {
    // Unique violation: the student already reported this attempt.
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "This attempt is already reported" },
        { status: 409 },
      );
    }
    console.error("[feedback-reports] insert failed", insertError);
    return NextResponse.json(
      { error: "Failed to record the report" },
      { status: 500 },
    );
  }

  return NextResponse.json({ reportId: inserted.id }, { status: 201 });
}

interface QuestionPayload {
  shortAnswer?: { stem?: unknown };
  text?: unknown;
}

function previewFromPayload(payload: QuestionPayload | null): string | null {
  if (!payload) return null;
  const stem =
    payload.shortAnswer && typeof payload.shortAnswer.stem === "string"
      ? payload.shortAnswer.stem
      : null;
  const text = typeof payload.text === "string" ? payload.text : null;
  const source = stem ?? text;
  if (!source) return null;
  return source.length > PREVIEW_LENGTH
    ? `${source.slice(0, PREVIEW_LENGTH).trimEnd()}…`
    : source;
}

export async function GET(request: Request) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requester.role || !["teacher", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "unreviewed";
  if (!["unreviewed", "reviewed", "all"].includes(status)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }
  const schoolId = url.searchParams.get("schoolId")?.trim() || null;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || 50),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const admin = createSupabaseAdminClient();

  // Optional school filter: restrict to students in that school, but only if
  // the caller has access to it (admins always do).
  let studentFilterIds: string[] | null = null;
  if (schoolId) {
    const scoped = await getScopedSchoolIds(admin, requester);
    if ("error" in scoped && scoped.error) {
      return NextResponse.json({ error: scoped.error }, { status: 400 });
    }
    if (requester.role === "teacher" && !scoped.schools.some((s) => s.id === schoolId)) {
      return NextResponse.json(
        { error: "You do not have access to this school." },
        { status: 403 },
      );
    }
    const { data: members } = await admin
      .from("school_members")
      .select("student_user_id")
      .eq("school_id", schoolId);
    studentFilterIds = (members ?? []).map((m) => String(m.student_user_id));
    if (studentFilterIds.length === 0) {
      return NextResponse.json({ reports: [], total: 0 });
    }
  }

  // The reports select runs on the caller's session client so RLS scopes
  // teachers to their own students; enrichment joins use the admin client.
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("feedback_reports")
    .select(
      "id, student_user_id, attempt_id, question_id, part_label, note, reviewed_at, reviewed_by, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });
  if (status === "unreviewed") query = query.is("reviewed_at", null);
  if (status === "reviewed") query = query.not("reviewed_at", "is", null);
  if (studentFilterIds) query = query.in("student_user_id", studentFilterIds);
  query = query.range(offset, offset + limit - 1);

  const { data: reportRows, count, error } = await query;
  if (error) {
    console.error("[feedback-reports] GET failed", error);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
  const reports = reportRows ?? [];

  const attemptIds = Array.from(new Set(reports.map((r) => String(r.attempt_id))));
  const studentIds = Array.from(new Set(reports.map((r) => String(r.student_user_id))));

  const [attemptsRes, profilesRes] = await Promise.all([
    attemptIds.length > 0
      ? admin
          .from("short_answer_attempts")
          .select(
            "id, user_id, question_id, part_label, response_text, score, max_score, feedback, method, model_id, confidence",
          )
          .in("id", attemptIds)
      : Promise.resolve({ data: [] }),
    studentIds.length > 0
      ? admin.from("profiles").select("id, display_name").in("id", studentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const attemptRows = (attemptsRes.data ?? []) as ReportAttemptRow[];
  const rawAttemptById = new Map(
    attemptRows.map((a) => [String(a.id), a]),
  );
  const verifiedAttemptByReportId = new Map<string, ReportAttemptRow>();
  const verifiedQuestionIds = new Set<string>();
  for (const report of reports) {
    const attempt = rawAttemptById.get(String(report.attempt_id));
    if (
      attempt &&
      String(attempt.user_id) === String(report.student_user_id) &&
      String(attempt.question_id) === String(report.question_id) &&
      String(attempt.part_label) === String(report.part_label)
    ) {
      verifiedAttemptByReportId.set(String(report.id), attempt);
      verifiedQuestionIds.add(String(report.question_id));
    }
  }

  const questionsRes =
    verifiedQuestionIds.size > 0
      ? await admin
          .from("generated_questions")
          .select("id, payload")
          .in("id", Array.from(verifiedQuestionIds))
      : { data: [] };

  const nameById = new Map(
    (profilesRes.data ?? []).map((p) => [
      String(p.id),
      typeof p.display_name === "string" && p.display_name.trim()
        ? p.display_name.trim()
        : null,
    ]),
  );
  const payloadById = new Map(
    (questionsRes.data ?? []).map((q) => [
      String(q.id),
      q.payload as QuestionPayload,
    ]),
  );

  return NextResponse.json({
    reports: reports.map((report) => {
      const attempt = verifiedAttemptByReportId.get(String(report.id));
      return {
        id: String(report.id),
        createdAt: String(report.created_at),
        student: {
          id: String(report.student_user_id),
          displayName: nameById.get(String(report.student_user_id)) ?? null,
        },
        questionId: String(report.question_id),
        questionPreview: previewFromPayload(
          attempt ? (payloadById.get(String(report.question_id)) ?? null) : null,
        ),
        partLabel: String(report.part_label),
        note: report.note ?? null,
        attempt: attempt
          ? {
              responseText: attempt.response_text ?? "",
              score: attempt.score,
              maxScore: attempt.max_score,
              feedback: attempt.feedback,
              method: attempt.method ?? null,
              modelId: attempt.model_id ?? null,
              confidence: attempt.confidence ?? null,
            }
          : null,
        reviewedAt: report.reviewed_at ?? null,
      };
    }),
    total: count ?? reports.length,
  });
}

interface PatchBody {
  reportId: string;
  reviewed: boolean;
}

function parsePatchBody(raw: unknown): PatchBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.reportId !== "string" || !UUID_RE.test(b.reportId)) return null;
  if (typeof b.reviewed !== "boolean") return null;
  return { reportId: b.reportId, reviewed: b.reviewed };
}

export async function PATCH(request: Request) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requester.role || !["teacher", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = parsePatchBody(raw);
  if (!body) {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  // RLS restricts the update to reports the caller may review; an out-of-scope
  // or unknown report id matches no row.
  const supabase = await createSupabaseServerClient();
  const { data: updated, error } = await supabase
    .from("feedback_reports")
    .update({
      reviewed_at: body.reviewed ? new Date().toISOString() : null,
      reviewed_by: body.reviewed ? requester.id : null,
    })
    .eq("id", body.reportId)
    .select("id, reviewed_at")
    .maybeSingle();

  if (error) {
    console.error("[feedback-reports] PATCH failed", error);
    return NextResponse.json({ error: "Failed to update report" }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json({
    reportId: String(updated.id),
    reviewedAt: updated.reviewed_at ?? null,
  });
}
