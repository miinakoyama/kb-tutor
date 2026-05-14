import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface AttemptBody {
  clientAttemptId?: string;
  questionId?: string;
  selectedOptionId?: string;
  isCorrect?: boolean;
  mode?: string;
  module?: number | null;
  topic?: string | null;
  standardId?: string | null;
  standardLabel?: string | null;
  timeSpentSec?: number | null;
  assignmentId?: string | null;
  answeredAt?: string;
}

const ALLOWED_MODES = new Set(["practice", "exam", "review"]);

function parseConstraint(message: string): string | null {
  const match = /constraint\s+"([^"]+)"/i.exec(message);
  return match ? match[1] : null;
}

function toHttpError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

async function resolveAuthorizedAssignmentId(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  assignmentId: string | null | undefined,
): Promise<{ assignmentId: string | null; error: string | null }> {
  const normalizedAssignmentId = assignmentId?.trim();
  if (!normalizedAssignmentId) {
    return { assignmentId: null, error: null };
  }

  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("id,school_id,created_at")
    .eq("id", normalizedAssignmentId)
    .maybeSingle();
  if (assignmentError) {
    return { assignmentId: null, error: assignmentError.message };
  }
  if (!assignment) {
    return { assignmentId: null, error: null };
  }

  const [{ data: targetRow, error: targetError }, { data: memberRow, error: memberError }] =
    await Promise.all([
      admin
        .from("assignment_targets")
        .select("assignment_id")
        .eq("assignment_id", normalizedAssignmentId)
        .eq("student_user_id", userId)
        .maybeSingle(),
      admin
        .from("school_members")
        .select("school_id")
        .eq("school_id", assignment.school_id)
        .eq("student_user_id", userId)
        .maybeSingle(),
    ]);
  if (targetError) {
    return { assignmentId: null, error: targetError.message };
  }
  if (memberError) {
    return { assignmentId: null, error: memberError.message };
  }

  if (targetRow) {
    return { assignmentId: normalizedAssignmentId, error: null };
  }

  if (!memberRow) {
    return { assignmentId: null, error: null };
  }

  const assignmentCreatedAt =
    typeof assignment.created_at === "string" ? assignment.created_at : null;
  if (!assignmentCreatedAt) {
    return { assignmentId: null, error: "Assignment is missing created_at" };
  }
  const { error: insertTargetError } = await admin
    .from("assignment_targets")
    .insert({
      assignment_id: normalizedAssignmentId,
      student_user_id: userId,
      created_at: assignmentCreatedAt,
    });
  if (insertTargetError) {
    const code = (insertTargetError as { code?: string }).code;
    if (code !== "23505") {
      return { assignmentId: null, error: insertTargetError.message };
    }
  }

  return { assignmentId: normalizedAssignmentId, error: null };
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return toHttpError(401, "Unauthorized");

  const body = (await request.json().catch(() => ({}))) as AttemptBody;

  if (!body.clientAttemptId) {
    return toHttpError(400, "Missing clientAttemptId");
  }
  if (!body.questionId) {
    return toHttpError(400, "Missing questionId");
  }
  if (!body.selectedOptionId) {
    return toHttpError(400, "Missing selectedOptionId");
  }
  if (typeof body.isCorrect !== "boolean") {
    return toHttpError(400, "Missing isCorrect");
  }
  if (!body.mode || !ALLOWED_MODES.has(body.mode)) {
    return toHttpError(400, `Invalid mode: ${body.mode ?? "<missing>"}`);
  }

  const answeredAt =
    body.answeredAt && !Number.isNaN(new Date(body.answeredAt).getTime())
      ? new Date(body.answeredAt).toISOString()
      : new Date().toISOString();

  const admin = createSupabaseAdminClient();
  const assignmentResolution = await resolveAuthorizedAssignmentId(
    admin,
    user.id,
    body.assignmentId,
  );
  if (assignmentResolution.error) {
    return toHttpError(400, assignmentResolution.error);
  }

  const payload = {
    user_id: user.id,
    client_attempt_id: body.clientAttemptId,
    question_id: body.questionId,
    selected_option_id: body.selectedOptionId,
    is_correct: body.isCorrect,
    mode: body.mode,
    module:
      typeof body.module === "number" && Number.isFinite(body.module)
        ? Math.round(body.module)
        : null,
    topic: body.topic ?? null,
    standard_id: body.standardId ?? null,
    standard_label: body.standardLabel ?? null,
    time_spent_sec:
      typeof body.timeSpentSec === "number" && Number.isFinite(body.timeSpentSec)
        ? Math.max(0, Math.round(body.timeSpentSec))
        : null,
    assignment_id: assignmentResolution.assignmentId,
    answered_at: answeredAt,
  };

  const writeAttempt = async (assignmentId: string | null) =>
    await admin
      .from("attempts")
      .upsert(
        { ...payload, assignment_id: assignmentId },
        { onConflict: "client_attempt_id", ignoreDuplicates: true },
      );

  let { error } = await writeAttempt(payload.assignment_id);

  if (
    error &&
    error.code === "23503" &&
    parseConstraint(error.message) === "attempts_assignment_id_fkey" &&
    payload.assignment_id !== null
  ) {
    const retry = await writeAttempt(null);
    error = retry.error;
  }

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code ?? null,
        details: error.details ?? null,
        constraint: parseConstraint(error.message),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
