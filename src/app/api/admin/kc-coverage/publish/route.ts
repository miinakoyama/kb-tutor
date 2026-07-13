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

  const { data: question, error: questionError } = await db
    .from("generated_questions")
    .select("payload")
    .eq("set_id", command.questionSetId)
    .eq("id", command.questionId)
    .maybeSingle();
  if (questionError || !question) return NextResponse.json({ error: "Question not found" }, { status: 404 });
  const partLabel = command.partLabel ?? null;
  const closeQuery = db.from("question_kc_assignments").update({ valid_to: new Date().toISOString() })
    .eq("question_set_id", command.questionSetId).eq("question_id", command.questionId).is("valid_to", null);
  const { data: closedRows, error: closeError } = partLabel
    ? await closeQuery.eq("part_label", partLabel).select("id")
    : await closeQuery.is("part_label", null).select("id");
  if (closeError) return NextResponse.json({ error: "Unable to close current mapping" }, { status: 500 });
  let mappingChanged = (closedRows?.length ?? 0) > 0;
  const standardId = isRecord(question.payload) && typeof question.payload.standardId === "string" ? question.payload.standardId : "";
  if (command.action === "replace_mapping") {
    const { data: kc } = await db.from("knowledge_components").select("code").eq("code", command.kcCode).eq("standard_id", standardId).eq("active", true).maybeSingle();
    if (!kc) return NextResponse.json({ error: "KC is not active in the question standard" }, { status: 400 });
    const { data: coverage } = await db.from("bkt_question_coverage").select("current_content_hash,format").eq("question_set_id", command.questionSetId).eq("question_id", command.questionId).maybeSingle();
    const { error } = await db.from("question_kc_assignments").insert({
      question_set_id: command.questionSetId,
      question_id: command.questionId,
      part_label: partLabel,
      format: coverage?.format ?? (partLabel ? "saq" : "mcq"),
      standard_id: standardId,
      kc_code: command.kcCode,
      status: "confirmed",
      provenance: "admin",
      source_content_hash: coverage?.current_content_hash,
      created_by: guard.userId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    mappingChanged = true;
  }
  // Only force the standard back to disabled when a mapping actually changed —
  // a withdraw on a question with no open mapping (e.g. never confirmed) is a
  // no-op and must not silently disable an otherwise-healthy standard.
  if (mappingChanged && standardId) {
    await db.from("bkt_standard_rollouts").upsert({ standard_id: standardId, status: "disabled", disable_reason: "KC mapping changed", disabled_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  }
  return NextResponse.json({ ok: true, standardId, mappingChanged });
}
