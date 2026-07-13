import OpenAI from "openai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getGeminiKey, getOpenAIKey } from "../../src/lib/llm/env.ts";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "../../src/lib/supabase/env.ts";

const MODEL_A = process.env.BKT_CLASSIFIER_MODEL_A ?? "gpt-5.4-mini";
const MODEL_B = process.env.BKT_CLASSIFIER_MODEL_B ?? "gemini-3.1-flash-lite-preview";
const PROMPT_VERSION = "legacy-kc-v1";
const BATCH_SIZE = 10;

export interface ClassifierOutput {
  questionId: string;
  outcome: "assigned" | "ambiguous" | "invalid";
  kcCode: string | null;
  rationale: string;
}

interface FrozenQuestion {
  questionSetId: string;
  questionId: string;
  standardId: string;
  contentHash: string;
  text: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  explanation: string;
}

interface CatalogKc {
  code: string;
  statement: string;
}

interface CliOptions {
  sample: number | null;
  selfPractice: boolean;
  standards: string[];
  sets: string[];
  questions: string[];
  resume: string | null;
  actor: string | null;
  verbose: boolean;
}

function csv(value: string | undefined): string[] {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

export function parseArgs(args: string[]): CliOptions {
  const valueAfter = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const sampleRaw = valueAfter("--sample");
  const sample = sampleRaw ? Number.parseInt(sampleRaw, 10) : null;
  if (sample !== null && (!Number.isInteger(sample) || sample < 1)) {
    throw new Error("--sample must be a positive integer");
  }
  return {
    sample,
    selfPractice: args.includes("--self-practice"),
    standards: csv(valueAfter("--standards")),
    sets: csv(valueAfter("--sets")),
    questions: csv(valueAfter("--questions")),
    resume: valueAfter("--resume") ?? null,
    actor: valueAfter("--actor") ?? null,
    verbose: args.includes("--verbose"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseClassifierBatch(
  raw: string,
  expected: readonly FrozenQuestion[],
  allowedKcs: ReadonlyMap<string, ReadonlySet<string>>,
): ClassifierOutput[] {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || !Array.isArray(parsed.decisions)) {
    throw new Error("Classifier response must contain a decisions array");
  }
  const expectedById = new Map(expected.map((question) => [question.questionId, question]));
  const seen = new Set<string>();
  return parsed.decisions.map((item: unknown) => {
    if (!isRecord(item)) throw new Error("Classifier decision must be an object");
    const questionId = typeof item.questionId === "string" ? item.questionId : "";
    const question = expectedById.get(questionId);
    if (!question || seen.has(questionId)) throw new Error(`Unexpected or duplicate questionId: ${questionId}`);
    seen.add(questionId);
    const outcome = item.outcome;
    if (outcome !== "assigned" && outcome !== "ambiguous" && outcome !== "invalid") {
      throw new Error(`Invalid outcome for ${questionId}`);
    }
    const rationale = typeof item.rationale === "string" ? item.rationale.trim() : "";
    const kcCode = typeof item.kcCode === "string" ? item.kcCode.trim() : null;
    if ((outcome === "assigned" || outcome === "ambiguous") && !rationale) {
      throw new Error(`Missing rationale for ${questionId}`);
    }
    if (outcome === "assigned" && (!kcCode || !allowedKcs.get(question.standardId)?.has(kcCode))) {
      throw new Error(`Assigned KC is not active in ${question.standardId}`);
    }
    return { questionId, outcome, kcCode: outcome === "assigned" ? kcCode : null, rationale };
  });
}

function promptFor(questions: readonly FrozenQuestion[], catalog: Map<string, CatalogKc[]>) {
  return JSON.stringify({
    instruction:
      "Assign the single Knowledge Component directly assessed by each MCQ. Use only the supplied KCs. Mark ambiguous when more than one KC is equally central and invalid when the item cannot be classified.",
    outputSchema: {
      decisions: [{ questionId: "string", outcome: "assigned|ambiguous|invalid", kcCode: "string|null", rationale: "short string" }],
    },
    questions: questions.map((question) => ({
      questionId: question.questionId,
      standardId: question.standardId,
      text: question.text,
      options: question.options,
      correctOptionId: question.correctOptionId,
      explanation: question.explanation,
      allowedKcs: catalog.get(question.standardId) ?? [],
    })),
  });
}

async function classifyBatch(
  client: OpenAI,
  model: string,
  questions: readonly FrozenQuestion[],
  catalog: Map<string, CatalogKc[]>,
) {
  const started = Date.now();
  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You classify biology MCQs into a constrained KC catalog. Return JSON only." },
      { role: "user", content: promptFor(questions, catalog) },
    ],
  });
  const allowed = new Map(
    Array.from(catalog, ([standard, kcs]) => [standard, new Set(kcs.map((kc) => kc.code))]),
  );
  return {
    decisions: parseClassifierBatch(response.choices[0]?.message.content ?? "", questions, allowed),
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - started,
  };
}

function payloadQuestion(row: Record<string, unknown>, hash: string): FrozenQuestion | null {
  const payload = isRecord(row.payload) ? row.payload : null;
  if (!payload || payload.questionType === "open-ended") return null;
  const standardId = typeof payload.standardId === "string" ? payload.standardId : "";
  const questionId = typeof row.id === "string" ? row.id : "";
  const questionSetId = typeof row.set_id === "string" ? row.set_id : "";
  const options = Array.isArray(payload.options)
    ? payload.options.flatMap((option) =>
        isRecord(option) && typeof option.id === "string" && typeof option.text === "string"
          ? [{ id: option.id, text: option.text }]
          : [],
      )
    : [];
  if (!standardId || !questionId || !questionSetId || typeof payload.text !== "string") return null;
  return {
    questionSetId,
    questionId,
    standardId,
    contentHash: hash,
    text: payload.text,
    options,
    correctOptionId: typeof payload.correctOptionId === "string" ? payload.correctOptionId : "",
    explanation: typeof payload.explanation === "string" ? payload.explanation : "",
  };
}

async function loadQuestions(db: SupabaseClient, options: CliOptions): Promise<FrozenQuestion[]> {
  let coverageQuery = db
    .from("bkt_question_coverage")
    .select("question_set_id,question_id,current_content_hash")
    .eq("format", "mcq")
    .neq("coverage_state", "valid");
  if (options.selfPractice) coverageQuery = coverageQuery.eq("include_in_self_practice", true);
  if (options.standards.length) coverageQuery = coverageQuery.in("standard_id", options.standards);
  if (options.sets.length) coverageQuery = coverageQuery.in("question_set_id", options.sets);
  if (options.questions.length) coverageQuery = coverageQuery.in("question_id", options.questions);
  const { data: coverage, error: coverageError } = await coverageQuery;
  if (coverageError) throw new Error(coverageError.message);
  const selected = (coverage ?? [])
    .sort((a, b) => `${a.question_set_id}/${a.question_id}`.localeCompare(`${b.question_set_id}/${b.question_id}`))
    .slice(0, options.sample ?? undefined);
  if (!selected.length) return [];
  const ids = selected.map((row) => String(row.question_id));
  const setIds = [...new Set(selected.map((row) => String(row.question_set_id)))];
  const { data: rows, error } = await db
    .from("generated_questions")
    .select("id,set_id,payload")
    .in("set_id", setIds)
    .in("id", ids);
  if (error) throw new Error(error.message);
  const hashByKey = new Map(selected.map((row) => [`${row.question_set_id}/${row.question_id}`, String(row.current_content_hash)]));
  return (rows ?? []).flatMap((row) => {
    const question = payloadQuestion(row as Record<string, unknown>, hashByKey.get(`${row.set_id}/${row.id}`) ?? "");
    return question ? [question] : [];
  });
}

async function loadFrozenQuestions(db: SupabaseClient, runId: string): Promise<FrozenQuestion[]> {
  const { data: run, error: runError } = await db
    .from("kc_classification_runs")
    .select("scope,status")
    .eq("id", runId)
    .maybeSingle();
  if (runError || !run) throw new Error("Classification run not found");
  if (run.status !== "running" && run.status !== "failed" && run.status !== "preview_complete") {
    throw new Error(`Classification run cannot be resumed from status ${run.status}`);
  }
  const scope = isRecord(run.scope) ? run.scope : {};
  const frozen = Array.isArray(scope.questions)
    ? scope.questions.flatMap((item) =>
        isRecord(item) && typeof item.setId === "string" && typeof item.questionId === "string" && typeof item.contentHash === "string"
          ? [{ setId: item.setId, questionId: item.questionId, contentHash: item.contentHash }]
          : [],
      )
    : [];
  if (!frozen.length) throw new Error("Classification run has no frozen question scope");
  const { data: rows, error } = await db
    .from("generated_questions")
    .select("id,set_id,payload")
    .in("set_id", [...new Set(frozen.map((item) => item.setId))])
    .in("id", [...new Set(frozen.map((item) => item.questionId))]);
  if (error) throw new Error(error.message);
  const frozenByKey = new Map(frozen.map((item) => [`${item.setId}/${item.questionId}`, item.contentHash]));
  return (rows ?? []).flatMap((row) => {
    const hash = frozenByKey.get(`${row.set_id}/${row.id}`);
    if (!hash) return [];
    const question = payloadQuestion(row as Record<string, unknown>, hash);
    return question ? [question] : [];
  });
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const db = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const questions = options.resume
    ? await loadFrozenQuestions(db, options.resume)
    : await loadQuestions(db, options);
  if (!questions.length) {
    console.log("No unresolved MCQs matched the requested scope.");
    return;
  }
  const standards = [...new Set(questions.map((question) => question.standardId))];
  const { data: kcRows, error: kcError } = await db
    .from("knowledge_components")
    .select("code,standard_id,statement")
    .eq("active", true)
    .in("standard_id", standards);
  if (kcError) throw new Error(kcError.message);
  const catalog = new Map<string, CatalogKc[]>();
  for (const row of kcRows ?? []) {
    const list = catalog.get(String(row.standard_id)) ?? [];
    list.push({ code: String(row.code), statement: String(row.statement) });
    catalog.set(String(row.standard_id), list);
  }

  let runId = options.resume;
  if (!runId) {
    const { data, error } = await db.from("kc_classification_runs").insert({
      status: "running",
      scope: {
        selfPractice: options.selfPractice,
        standards: options.standards,
        sets: options.sets,
        questions: questions.map((question) => ({
          setId: question.questionSetId,
          questionId: question.questionId,
          contentHash: question.contentHash,
        })),
        frozenAt: new Date().toISOString(),
      },
      classifier_a_model: MODEL_A,
      classifier_b_model: MODEL_B,
      classifier_a_prompt_version: PROMPT_VERSION,
      classifier_b_prompt_version: PROMPT_VERSION,
      target_count: questions.length,
      started_at: new Date().toISOString(),
      created_by: options.actor,
    }).select("id").single();
    if (error) throw new Error(error.message);
    runId = String(data.id);
  }

  const openai = new OpenAI({ apiKey: getOpenAIKey() });
  const gemini = new OpenAI({
    apiKey: getGeminiKey(),
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  });
  let inputTokens = 0;
  let outputTokens = 0;
  let errors = 0;
  const { data: priorDecisions, error: priorError } = await db
    .from("kc_classification_decisions")
    .select("question_set_id,question_id,pass,outcome")
    .eq("run_id", runId);
  if (priorError) throw new Error(priorError.message);
  const completedPasses = new Set(
    (priorDecisions ?? [])
      .filter((decision) => decision.outcome !== "error")
      .map((decision) => `${decision.question_set_id}/${decision.question_id}/${decision.pass}`),
  );
  for (let offset = 0; offset < questions.length; offset += BATCH_SIZE) {
    const batch = questions.slice(offset, offset + BATCH_SIZE);
    const clientFor = (model: string) => (model.startsWith("gemini") ? gemini : openai);
    for (const [pass, model, client] of [
      [1, MODEL_A, clientFor(MODEL_A)],
      [2, MODEL_B, clientFor(MODEL_B)],
    ] as const) {
      const passBatch = batch.filter(
        (question) => !completedPasses.has(`${question.questionSetId}/${question.questionId}/${pass}`),
      );
      if (!passBatch.length) continue;
      try {
        const result = await classifyBatch(client, model, passBatch, catalog);
        inputTokens += result.inputTokens;
        outputTokens += result.outputTokens;
        const byId = new Map(result.decisions.map((decision) => [decision.questionId, decision]));
        const rows = passBatch.map((question) => {
          const decision = byId.get(question.questionId);
          if (!decision) throw new Error(`Missing decision for ${question.questionId}`);
          return {
            run_id: runId,
            question_set_id: question.questionSetId,
            question_id: question.questionId,
            pass,
            model_id: model,
            prompt_version: PROMPT_VERSION,
            source_content_hash: question.contentHash,
            outcome: decision.outcome,
            kc_code: decision.kcCode,
            rationale: decision.rationale,
            input_tokens: Math.ceil(result.inputTokens / passBatch.length),
            output_tokens: Math.ceil(result.outputTokens / passBatch.length),
            latency_ms: result.latencyMs,
          };
        });
        const { error } = await db.from("kc_classification_decisions").upsert(rows, {
          onConflict: "run_id,question_set_id,question_id,pass",
        });
        if (error) throw new Error(error.message);
      } catch (error) {
        errors += passBatch.length;
        const message = error instanceof Error ? error.message : "Unknown classifier error";
        const rows = passBatch.map((question) => ({
          run_id: runId,
          question_set_id: question.questionSetId,
          question_id: question.questionId,
          pass,
          model_id: model,
          prompt_version: PROMPT_VERSION,
          source_content_hash: question.contentHash,
          outcome: "error",
          error_code: "CLASSIFIER_BATCH_ERROR",
          rationale: message.slice(0, 500),
        }));
        await db.from("kc_classification_decisions").upsert(rows, {
          onConflict: "run_id,question_set_id,question_id,pass",
        });
      }
    }
  }
  const { data: decisions } = await db
    .from("kc_classification_decisions")
    .select("question_set_id,question_id,pass,outcome,kc_code")
    .eq("run_id", runId);
  const grouped = new Map<string, Array<{ pass: number; outcome: string; kc_code: string | null }>>();
  for (const decision of decisions ?? []) {
    const key = `${decision.question_set_id}/${decision.question_id}`;
    const list = grouped.get(key) ?? [];
    list.push(decision);
    grouped.set(key, list);
  }
  const agreements = Array.from(grouped.values()).filter(
    (items) => items.length === 2 && items.every((item) => item.outcome === "assigned") && items[0].kc_code === items[1].kc_code,
  ).length;
  const completed = Array.from(grouped.values()).filter((items) => items.length === 2).length;
  const { error: updateError } = await db.from("kc_classification_runs").update({
    status: "preview_complete",
    completed_count: completed,
    agreement_count: agreements,
    unresolved_count: Math.max(0, completed - agreements),
    error_count: errors,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    completed_at: new Date().toISOString(),
  }).eq("id", runId);
  if (updateError) throw new Error(updateError.message);
  console.log(`Run: ${runId}`);
  console.log(`Targeted: ${questions.length}`);
  console.log(`Completed: ${completed}`);
  console.log(`Agreed: ${agreements}`);
  console.log(`Ambiguous/disagreed: ${Math.max(0, completed - agreements)}`);
  console.log(`Errors: ${errors}`);
  console.log(`Input tokens: ${inputTokens}`);
  console.log(`Output tokens: ${outputTokens}`);
  console.log("Active mappings changed: 0");
  if (options.verbose) console.log(`Question IDs: ${questions.map((question) => question.questionId).join(", ")}`);
}

if (process.argv[1]?.endsWith("classify-legacy-kcs.ts")) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Classification failed");
    process.exitCode = 1;
  });
}
