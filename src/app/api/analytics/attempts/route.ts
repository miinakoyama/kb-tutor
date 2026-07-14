import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

interface AttemptBody {
  clientAttemptId?: string;
  questionId?: string;
  questionSetId?: string | null;
  questionContentVersion?: string | null;
  isFinalized?: boolean;
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function correctOptionIdFromPayload(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const correctOptionId = (value as Record<string, unknown>).correctOptionId;
  return typeof correctOptionId === "string" && correctOptionId ? correctOptionId : null;
}

interface AuthoritativeQuestion {
  correctOptionId: string;
  questionSetId: string | null;
  questionContentVersion: string | null;
}

function questionIdentityFromPayload(
  value: unknown,
): Pick<AuthoritativeQuestion, "questionSetId" | "questionContentVersion"> {
  if (!value || typeof value !== "object") {
    return { questionSetId: null, questionContentVersion: null };
  }
  const payload = value as Record<string, unknown>;
  const questionSetId =
    typeof payload.questionSetId === "string" && payload.questionSetId.trim()
      ? payload.questionSetId.trim()
      : null;
  const questionContentVersion =
    typeof payload.contentVersion === "string" && UUID_RE.test(payload.contentVersion)
      ? payload.contentVersion
      : null;
  return { questionSetId, questionContentVersion };
}

async function canAccessHistoricalQuestion(
  requester: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  questionSetId: string,
  questionId: string,
): Promise<boolean> {
  const { data: currentlyAccessible } = await requester
    .from("generated_questions")
    .select("id")
    .eq("set_id", questionSetId)
    .eq("id", questionId)
    .maybeSingle();
  if (currentlyAccessible) return true;

  // A queued answer remains valid after the row is hidden or removed from
  // Self Practice. Verify the student's school relationship to the set
  // explicitly because the current generated_questions RLS no longer grants
  // access once include_in_self_practice is cleared.
  const { data: links, error: linkError } = await admin
    .from("school_question_sets")
    .select("school_id")
    .eq("set_id", questionSetId);
  if (linkError) return false;
  const schoolIds = [
    ...new Set((links ?? []).map((row) => String(row.school_id))),
  ];
  if (!schoolIds.length) return false;

  const { data: memberships, error: membershipError } = await admin
    .from("school_members")
    .select("school_id")
    .eq("student_user_id", userId)
    .in("school_id", schoolIds)
    .limit(1);
  return !membershipError && (memberships?.length ?? 0) > 0;
}

async function resolveAuthoritativeQuestion(
  requester: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  questionId: string,
  assignmentId: string | null,
  questionSetId: string | null,
  questionContentVersion: string | null,
): Promise<AuthoritativeQuestion | null> {
  if (assignmentId) {
    const { data, error } = await admin
      .from("assignment_question_snapshots")
      .select("payload")
      .eq("assignment_id", assignmentId)
      .eq("question_id", questionId);
    if (error) return null;

    const snapshots = data ?? [];
    const matchingSnapshots = questionSetId
      ? snapshots.filter((snapshot) => {
          const identity = questionIdentityFromPayload(snapshot.payload);
          return identity.questionSetId === questionSetId &&
            (!questionContentVersion ||
              identity.questionContentVersion === questionContentVersion);
        })
      : snapshots.length === 1
        ? snapshots
        : [];
    if (matchingSnapshots.length !== 1) {
      if (matchingSnapshots.length > 1) {
        console.error("Ambiguous assignment question snapshot identity", {
          assignmentId,
          questionId,
          questionSetId,
          questionContentVersion,
          matchingSnapshotCount: matchingSnapshots.length,
        });
      }
      return null;
    }
    const snapshot = matchingSnapshots[0];
    const correctOptionId = correctOptionIdFromPayload(snapshot?.payload);
    if (!correctOptionId) return null;
    return {
      correctOptionId,
      ...questionIdentityFromPayload(snapshot.payload),
    };
  }

  if (questionSetId) {
    if (questionContentVersion) {
      const canAccess = await canAccessHistoricalQuestion(
        requester,
        admin,
        userId,
        questionSetId,
        questionId,
      );
      if (!canAccess) return null;

      const { data: version } = await admin
        .from("generated_question_versions")
        .select("payload")
        .eq("question_set_id", questionSetId)
        .eq("question_id", questionId)
        .eq("content_version", questionContentVersion)
        .maybeSingle();
      const correctOptionId = correctOptionIdFromPayload(version?.payload);
      return correctOptionId
        ? { correctOptionId, questionSetId, questionContentVersion }
        : null;
    }

    const { data } = await requester
      .from("generated_questions")
      .select("payload")
      .eq("set_id", questionSetId)
      .eq("id", questionId)
      .eq("is_visible", true)
      .maybeSingle();
    if (!data) return null;
    const correctOptionId = correctOptionIdFromPayload(data.payload);
    return correctOptionId
      ? { correctOptionId, questionSetId, questionContentVersion: null }
      : null;
  }

  // Backward compatibility for attempts queued before question identity
  // snapshots were added. Ambiguous ids remain rejected by the length check.
  const { data } = await requester
    .from("generated_questions")
    .select("payload")
    .eq("id", questionId)
    .eq("is_visible", true)
    .limit(2);
  if (!data || data.length !== 1) return null;
  const correctOptionId = correctOptionIdFromPayload(data[0].payload);
  return correctOptionId
    ? { correctOptionId, questionSetId: null, questionContentVersion: null }
    : null;
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
  const questionSetId =
    typeof body.questionSetId === "string" && body.questionSetId.trim()
      ? body.questionSetId.trim()
      : null;
  const questionContentVersion =
    typeof body.questionContentVersion === "string" &&
    UUID_RE.test(body.questionContentVersion)
      ? body.questionContentVersion
      : null;
  if (body.questionContentVersion && !questionContentVersion) {
    return toHttpError(400, "Invalid questionContentVersion");
  }
  if (questionContentVersion && !questionSetId) {
    return toHttpError(400, "questionSetId is required with questionContentVersion");
  }
  if (!body.selectedOptionId) {
    return toHttpError(400, "Missing selectedOptionId");
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
  const authoritativeQuestion = await resolveAuthoritativeQuestion(
    supabase,
    admin,
    user.id,
    body.questionId,
    assignmentResolution.assignmentId,
    questionSetId,
    questionContentVersion,
  );
  if (!authoritativeQuestion) {
    return toHttpError(404, "Question not found or inaccessible");
  }
  const isCorrect = body.selectedOptionId === authoritativeQuestion.correctOptionId;
  const isFinalized = !(
    body.isFinalized === false &&
    body.mode === "exam" &&
    assignmentResolution.assignmentId
  );

  const payload = {
    user_id: user.id,
    client_attempt_id: body.clientAttemptId,
    question_id: body.questionId,
    question_set_id: authoritativeQuestion.questionSetId,
    question_content_version: authoritativeQuestion.questionContentVersion,
    is_finalized: isFinalized,
    selected_option_id: body.selectedOptionId,
    is_correct: isCorrect,
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

  return NextResponse.json({ ok: true, isCorrect });
}
