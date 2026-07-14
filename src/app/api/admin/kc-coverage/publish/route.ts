import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/auth/require-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type CoverageCommand =
  | { action: "publish_run"; runId: string; confirmed: boolean }
  | { action: "rollback_run"; runId: string; confirmed: boolean }
  | { action: "validate_standard"; standardId: string; confirmed: boolean }
  | { action: "enable_standard"; standardId: string; reason?: string; confirmed: boolean }
  | { action: "disable_standard"; standardId: string; reason?: string; confirmed: boolean }
  | { action: "replace_mapping"; questionSetId: string; questionId: string; partLabel?: string | null; kcCode: string; confirmed: boolean }
  | { action: "withdraw_mapping"; questionSetId: string; questionId: string; partLabel?: string | null; confirmed: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCommand(value: unknown): CoverageCommand | null {
  if (!isRecord(value) || value.confirmed !== true || typeof value.action !== "string") return null;
  if ((value.action === "publish_run" || value.action === "rollback_run") && typeof value.runId === "string") {
    return { action: value.action, runId: value.runId, confirmed: true };
  }
  if (
    (value.action === "validate_standard" || value.action === "enable_standard" || value.action === "disable_standard") &&
    typeof value.standardId === "string"
  ) {
    return { action: value.action, standardId: value.standardId, reason: typeof value.reason === "string" ? value.reason : undefined, confirmed: true } as CoverageCommand;
  }
  if (
    value.action === "replace_mapping" && typeof value.questionSetId === "string" &&
    typeof value.questionId === "string" && typeof value.kcCode === "string"
  ) {
    return { action: value.action, questionSetId: value.questionSetId, questionId: value.questionId, partLabel: typeof value.partLabel === "string" ? value.partLabel : null, kcCode: value.kcCode, confirmed: true };
  }
  if (value.action === "withdraw_mapping" && typeof value.questionSetId === "string" && typeof value.questionId === "string") {
    return { action: value.action, questionSetId: value.questionSetId, questionId: value.questionId, partLabel: typeof value.partLabel === "string" ? value.partLabel : null, confirmed: true };
  }
  return null;
}

export async function POST(request: Request) {
  const guard = await requireAdminRoute();
  if (!guard.ok) return guard.response;
  const command = parseCommand(await request.json().catch(() => null));
  if (!command) return NextResponse.json({ error: "Invalid or unconfirmed coverage command" }, { status: 400 });
  const db = createSupabaseAdminClient();
  if (command.action === "publish_run" || command.action === "rollback_run") {
    const functionName = command.action === "publish_run" ? "publish_kc_classification_run" : "rollback_kc_classification_run";
    const { data, error } = await db.rpc(functionName, { p_run_id: command.runId, p_actor: guard.userId });
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "23514" ? 409 : 400 });
    return NextResponse.json({ ok: true, data });
  }
  if (command.action === "validate_standard") {
    const { data, error } = await db.rpc("validate_bkt_standard_rollout", { p_standard_id: command.standardId, p_actor: guard.userId });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json(data);
  }
  if (command.action === "enable_standard" || command.action === "disable_standard") {
    const { data, error } = await db.rpc("set_bkt_standard_rollout", {
      p_standard_id: command.standardId,
      p_actor: guard.userId,
      p_enabled: command.action === "enable_standard",
      p_reason: command.action === "disable_standard" ? command.reason ?? null : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json(data);
  }
  if (command.action === "replace_mapping") {
    const { data, error } = await db.rpc("replace_question_kc_mapping", {
      p_question_set_id: command.questionSetId,
      p_question_id: command.questionId,
      p_part_label: command.partLabel ?? null,
      p_kc_code: command.kcCode,
      p_actor: guard.userId,
    });
    if (error) {
      const status = error.code === "P0002" ? 404 : error.code === "23514" ? 400 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (!isRecord(data)) {
      return NextResponse.json({ error: "Unable to replace KC mapping" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      standardId: typeof data.standardId === "string" ? data.standardId : "",
      mappingChanged: data.mappingChanged === true,
    });
  }

  const { data, error } = await db.rpc("withdraw_question_kc_mapping", {
    p_question_set_id: command.questionSetId,
    p_question_id: command.questionId,
    p_part_label: command.partLabel ?? null,
    p_actor: guard.userId,
  });
  if (error) {
    const status = error.code === "P0002" ? 404 : error.code === "23514" ? 400 : 409;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (!isRecord(data)) {
    return NextResponse.json({ error: "Unable to withdraw KC mapping" }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    standardId: typeof data.standardId === "string" ? data.standardId : "",
    mappingChanged: data.mappingChanged === true,
  });
}
