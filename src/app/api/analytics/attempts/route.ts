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
    assignment_id: body.assignmentId ?? null,
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
