import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/auth/require-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const VIEWS = new Set(["coverage", "runs", "exceptions"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function integerParam(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  const guard = await requireAdminRoute();
  if (!guard.ok) return guard.response;
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "coverage";
  if (!VIEWS.has(view)) {
    return NextResponse.json({ error: "Invalid coverage view" }, { status: 400 });
  }
  const limit = Math.min(100, Math.max(1, integerParam(url.searchParams.get("limit"), 50)));
  const cursor = Math.max(0, integerParam(url.searchParams.get("cursor"), 0));
  const standardId = url.searchParams.get("standardId");
  const setId = url.searchParams.get("setId");
  const status = url.searchParams.get("status");
  const selfPractice = url.searchParams.get("selfPractice");
  const db = createSupabaseAdminClient();

  if (view === "runs") {
    let query = db
      .from("kc_classification_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(cursor, cursor + limit - 1);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Unable to load classification runs" }, { status: 500 });
    return NextResponse.json({ rows: data ?? [], nextCursor: data?.length === limit ? cursor + limit : null });
  }

  if (view === "exceptions") {
    let query = db
      .from("kc_classification_decisions")
      .select("id,run_id,question_set_id,question_id,pass,model_id,outcome,kc_code,rationale,error_code,created_at")
      .neq("outcome", "assigned")
      .order("created_at", { ascending: false })
      .range(cursor, cursor + limit - 1);
    if (setId) query = query.eq("question_set_id", setId);
    if (status) query = query.eq("outcome", status);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Unable to load classification exceptions" }, { status: 500 });
    const decisions = data ?? [];

    // Attach the question's standard + current coverage state so the client can
    // offer a valid KC to assign, and return the active KC catalog for those
    // standards so a resolve control can be built without another round-trip.
    const setIds = [...new Set(decisions.map((row) => String(row.question_set_id)))];
    const coverageByKey = new Map<string, { standardId: string | null; coverageState: string | null }>();
    if (setIds.length) {
      const { data: coverage } = await db
        .from("bkt_question_coverage")
        .select("question_set_id,question_id,standard_id,coverage_state")
        .in("question_set_id", setIds);
      for (const row of coverage ?? []) {
        coverageByKey.set(`${row.question_set_id}/${row.question_id}`, {
          standardId: row.standard_id ? String(row.standard_id) : null,
          coverageState: row.coverage_state ? String(row.coverage_state) : null,
        });
      }
    }
    // Load the actual question content so the admin can read the item before
    // assigning a KC — the classifier's rationale alone isn't enough context.
    const questionByKey = new Map<string, { text: string; options: Array<{ id: string; text: string }>; correctOptionId: string }>();
    if (setIds.length) {
      const questionIds = [...new Set(decisions.map((row) => String(row.question_id)))];
      const { data: questions } = await db
        .from("generated_questions")
        .select("id,set_id,payload")
        .in("set_id", setIds)
        .in("id", questionIds);
      for (const q of questions ?? []) {
        const payload = isRecord(q.payload) ? q.payload : null;
        if (!payload || typeof payload.text !== "string") continue;
        const options = Array.isArray(payload.options)
          ? payload.options.flatMap((option) =>
              isRecord(option) && typeof option.id === "string" && typeof option.text === "string"
                ? [{ id: option.id, text: option.text }]
                : [],
            )
          : [];
        questionByKey.set(`${q.set_id}/${q.id}`, {
          text: payload.text,
          options,
          correctOptionId: typeof payload.correctOptionId === "string" ? payload.correctOptionId : "",
        });
      }
    }
    const rows = decisions.map((row) => {
      const key = `${row.question_set_id}/${row.question_id}`;
      const meta = coverageByKey.get(key);
      const question = questionByKey.get(key);
      return {
        ...row,
        standard_id: meta?.standardId ?? null,
        coverage_state: meta?.coverageState ?? null,
        question_text: question?.text ?? null,
        question_options: question?.options ?? [],
        question_correct_option_id: question?.correctOptionId ?? null,
      };
    });
    const standards = [...new Set(rows.map((row) => row.standard_id).filter((id): id is string => Boolean(id)))];
    const kcsByStandard: Record<string, Array<{ code: string; statement: string }>> = {};
    if (standards.length) {
      const { data: kcRows } = await db
        .from("knowledge_components")
        .select("code,standard_id,statement")
        .eq("active", true)
        .in("standard_id", standards)
        .order("code", { ascending: true });
      for (const kc of kcRows ?? []) {
        const id = String(kc.standard_id);
        (kcsByStandard[id] ??= []).push({ code: String(kc.code), statement: String(kc.statement) });
      }
    }
    return NextResponse.json({
      rows,
      kcs: kcsByStandard,
      nextCursor: decisions.length === limit ? cursor + limit : null,
    });
  }

  let query = db
    .from("bkt_question_coverage")
    .select("standard_id,question_set_id,question_id,format,include_in_self_practice,coverage_state,confirmed_kc_codes");
  if (standardId) query = query.eq("standard_id", standardId);
  if (setId) query = query.eq("question_set_id", setId);
  if (status) query = query.eq("coverage_state", status);
  if (selfPractice === "true" || selfPractice === "false") {
    query = query.eq("include_in_self_practice", selfPractice === "true");
  }
  const [{ data, error }, { data: kcs }, { data: rollouts }] = await Promise.all([
    query,
    db.from("knowledge_components").select("code,standard_id").eq("active", true),
    db.from("bkt_standard_rollouts").select("standard_id,status,coverage_hash"),
  ]);
  if (error) return NextResponse.json({ error: "Unable to load KC coverage" }, { status: 500 });
  const standards = new Map<string, {
    standardId: string;
    questionCount: number;
    selfPracticeCount: number;
    validCount: number;
    unresolvedCount: number;
    invalidCount: number;
    coveredKcs: Set<string>;
  }>();
  for (const row of data ?? []) {
    const id = String(row.standard_id ?? "Unassigned");
    const summary = standards.get(id) ?? {
      standardId: id,
      questionCount: 0,
      selfPracticeCount: 0,
      validCount: 0,
      unresolvedCount: 0,
      invalidCount: 0,
      coveredKcs: new Set<string>(),
    };
    summary.questionCount += 1;
    if (row.include_in_self_practice) summary.selfPracticeCount += 1;
    if (row.coverage_state === "valid") summary.validCount += 1;
    if (row.coverage_state === "unresolved") summary.unresolvedCount += 1;
    if (row.coverage_state === "invalid") summary.invalidCount += 1;
    if (Array.isArray(row.confirmed_kc_codes)) {
      row.confirmed_kc_codes.forEach((code) => typeof code === "string" && summary.coveredKcs.add(code));
    }
    standards.set(id, summary);
  }
  const activeByStandard = new Map<string, number>();
  for (const kc of kcs ?? []) {
    const id = String(kc.standard_id);
    activeByStandard.set(id, (activeByStandard.get(id) ?? 0) + 1);
  }
  const rolloutByStandard = new Map((rollouts ?? []).map((row) => [String(row.standard_id), row]));
  const rows = Array.from(standards.values())
    .sort((a, b) => a.standardId.localeCompare(b.standardId))
    .slice(cursor, cursor + limit)
    .map(({ coveredKcs, ...summary }) => ({
      ...summary,
      coveredKcCount: coveredKcs.size,
      activeKcCount: activeByStandard.get(summary.standardId) ?? 0,
      rolloutStatus: rolloutByStandard.get(summary.standardId)?.status ?? "disabled",
      coverageHash: rolloutByStandard.get(summary.standardId)?.coverage_hash ?? null,
    }));
  return NextResponse.json({ rows, nextCursor: rows.length === limit ? cursor + limit : null });
}
