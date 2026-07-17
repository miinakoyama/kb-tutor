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

interface CoverageRow {
  standard_id: string | null;
  question_set_id: string;
  question_id: string;
  format: string | null;
  include_in_self_practice: boolean;
  coverage_state: string | null;
  confirmed_kc_codes: string[] | null;
}

// The per-standard rollups below are only correct over the whole result set, and
// PostgREST caps an unbounded select at its configured max rows — so page the
// coverage read rather than silently rolling up a truncated slice.
const COVERAGE_PAGE_SIZE = 500;

async function selectAllCoveragePages(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: CoverageRow[] | null; error: { message: string } | null }>,
): Promise<{ ok: boolean; rows: CoverageRow[] }> {
  const rows: CoverageRow[] = [];
  for (let from = 0; ; from += COVERAGE_PAGE_SIZE) {
    const { data, error } = await page(from, from + COVERAGE_PAGE_SIZE - 1);
    if (error) return { ok: false, rows: [] };
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < COVERAGE_PAGE_SIZE) return { ok: true, rows };
  }
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

  // Practice serves each student only from their own school's bank
  // (see fetchStudentSelfPracticeQuestions), so coverage read globally can look
  // complete while a given school has no item for some KC. Scoping here makes
  // the page answer the question the rollout decision actually depends on.
  const schoolId = url.searchParams.get("schoolId");
  let schoolSetIds: string[] | null = null;
  if (schoolId) {
    const { data: links, error: linkError } = await db
      .from("school_question_sets")
      .select("set_id")
      .eq("school_id", schoolId);
    if (linkError) {
      return NextResponse.json({ error: "Unable to load school question sets" }, { status: 500 });
    }
    schoolSetIds = [...new Set((links ?? []).map((row) => String(row.set_id)))];
  }

  const coverageRows = await selectAllCoveragePages((from, to) => {
    let query = db
      .from("bkt_question_coverage")
      .select("standard_id,question_set_id,question_id,format,include_in_self_practice,coverage_state,confirmed_kc_codes")
      .range(from, to);
    if (standardId) query = query.eq("standard_id", standardId);
    if (setId) query = query.eq("question_set_id", setId);
    if (status) query = query.eq("coverage_state", status);
    if (schoolSetIds) query = query.in("question_set_id", schoolSetIds);
    if (selfPractice === "true" || selfPractice === "false") {
      query = query.eq("include_in_self_practice", selfPractice === "true");
    }
    return query;
  });
  if (!coverageRows.ok) {
    return NextResponse.json({ error: "Unable to load KC coverage" }, { status: 500 });
  }
  const data = schoolId && schoolSetIds?.length === 0 ? [] : coverageRows.rows;
  const [{ data: kcs }, { data: rollouts }, { data: schools }] = await Promise.all([
    db.from("knowledge_components").select("code,standard_id,statement").eq("active", true).order("code"),
    db.from("bkt_standard_rollouts").select("school_id,standard_id,status,coverage_hash"),
    db.from("schools").select("id,name").order("name"),
  ]);
  const standards = new Map<string, {
    standardId: string;
    questionCount: number;
    selfPracticeCount: number;
    validCount: number;
    unresolvedCount: number;
    invalidCount: number;
    // Only questions eligible for adaptive selection (valid + in Self Practice)
    // count towards a KC — anything else is not something Practice can serve.
    kcQuestionCounts: Map<string, number>;
  }>();
  for (const row of data) {
    const id = String(row.standard_id ?? "Unassigned");
    const summary = standards.get(id) ?? {
      standardId: id,
      questionCount: 0,
      selfPracticeCount: 0,
      validCount: 0,
      unresolvedCount: 0,
      invalidCount: 0,
      kcQuestionCounts: new Map<string, number>(),
    };
    summary.questionCount += 1;
    if (row.include_in_self_practice) summary.selfPracticeCount += 1;
    if (row.coverage_state === "valid") summary.validCount += 1;
    if (row.coverage_state === "unresolved") summary.unresolvedCount += 1;
    if (row.coverage_state === "invalid") summary.invalidCount += 1;
    if (
      row.coverage_state === "valid" &&
      row.include_in_self_practice &&
      Array.isArray(row.confirmed_kc_codes)
    ) {
      for (const code of row.confirmed_kc_codes) {
        if (typeof code !== "string") continue;
        summary.kcQuestionCounts.set(code, (summary.kcQuestionCounts.get(code) ?? 0) + 1);
      }
    }
    standards.set(id, summary);
  }
  const activeKcsByStandard = new Map<string, Array<{ code: string; statement: string }>>();
  for (const kc of kcs ?? []) {
    const id = String(kc.standard_id);
    const list = activeKcsByStandard.get(id) ?? [];
    list.push({ code: String(kc.code), statement: String(kc.statement) });
    activeKcsByStandard.set(id, list);
  }
  // A standard with active KCs but no questions in scope still needs a row —
  // otherwise a school missing a whole standard silently disappears from the page.
  for (const id of activeKcsByStandard.keys()) {
    if (standards.has(id)) continue;
    standards.set(id, {
      standardId: id,
      questionCount: 0,
      selfPracticeCount: 0,
      validCount: 0,
      unresolvedCount: 0,
      invalidCount: 0,
      kcQuestionCounts: new Map<string, number>(),
    });
  }
  // A rollout now belongs to one school, so a status is only well-defined when a
  // school is selected. Without one, report how many schools have it enabled
  // rather than inventing a single status the page could act on by mistake.
  const rolloutForSchool = new Map<string, { status: string; coverage_hash: string | null }>();
  const enabledSchoolsByStandard = new Map<string, number>();
  for (const rollout of rollouts ?? []) {
    const standard = String(rollout.standard_id);
    if (schoolId && String(rollout.school_id) === schoolId) {
      rolloutForSchool.set(standard, {
        status: String(rollout.status),
        coverage_hash: rollout.coverage_hash ? String(rollout.coverage_hash) : null,
      });
    }
    if (rollout.status === "enabled") {
      enabledSchoolsByStandard.set(standard, (enabledSchoolsByStandard.get(standard) ?? 0) + 1);
    }
  }
  const schoolCount = (schools ?? []).length;
  const rows = Array.from(standards.values())
    .sort((a, b) => a.standardId.localeCompare(b.standardId))
    .slice(cursor, cursor + limit)
    .map(({ kcQuestionCounts, ...summary }) => {
      const activeKcs = activeKcsByStandard.get(summary.standardId) ?? [];
      const kcBreakdown = activeKcs.map((kc) => ({
        code: kc.code,
        statement: kc.statement,
        questionCount: kcQuestionCounts.get(kc.code) ?? 0,
      }));
      const rollout = rolloutForSchool.get(summary.standardId);
      return {
        ...summary,
        kcs: kcBreakdown,
        coveredKcCount: kcBreakdown.filter((kc) => kc.questionCount > 0).length,
        activeKcCount: activeKcs.length,
        emptyKcCount: kcBreakdown.filter((kc) => kc.questionCount === 0).length,
        // A KC with a single item gives the selector nothing to rotate to once
        // the student has answered it, so surface it separately from a hard gap.
        thinKcCount: kcBreakdown.filter((kc) => kc.questionCount > 0 && kc.questionCount < 2).length,
        rolloutStatus: schoolId ? (rollout?.status ?? "disabled") : null,
        coverageHash: schoolId ? (rollout?.coverage_hash ?? null) : null,
        enabledSchoolCount: enabledSchoolsByStandard.get(summary.standardId) ?? 0,
        schoolCount,
      };
    });
  return NextResponse.json({
    rows,
    schools: (schools ?? []).map((school) => ({ id: String(school.id), name: String(school.name) })),
    nextCursor: rows.length === limit ? cursor + limit : null,
  });
}
