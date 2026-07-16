import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import OpenAI from "openai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getOpenAIKey } from "../../src/lib/llm/env.ts";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "../../src/lib/supabase/env.ts";
import { validateShortAnswerItem } from "../../src/lib/short-answer/item-schema.ts";
import type { KeyTerm, ShortAnswerItem } from "../../src/types/short-answer.ts";

const DEFAULT_MODEL = "gpt-5.4";
const DEFAULT_BATCH_SIZE = 5;
const PAGE_SIZE = 200;
const MAX_RETRIES = 3;
const APPLY_CONFIRMATION = "APPLY_KEY_TERM_BACKFILL";
const LEGACY_ERROR_PREFIX = "keyTerms must have a unique definition per term";

interface CliOptions {
  model: string;
  batchSize: number;
  limit: number | null;
  sets: string[];
  questions: string[];
  reportPath: string;
  fromReport: string | null;
  apply: boolean;
  confirmation: string | null;
  verbose: boolean;
}

interface GeneratedQuestionRow {
  id: string;
  set_id: string;
  payload: unknown;
  content_version: string;
}

interface SnapshotRow {
  id: string;
  assignment_id: string;
  question_id: string;
  payload: unknown;
}

interface Candidate {
  setId: string;
  questionId: string;
  contentVersion: string;
  payload: Record<string, unknown>;
  item: ShortAnswerItem;
  oldKeyTerms: KeyTerm[];
  contextFingerprint: string;
}

export interface KeyTermRepair {
  originalTerm: string;
  term: string;
  definition: string;
}

export interface KeyTermDecision {
  setId: string;
  questionId: string;
  keyTerms: KeyTermRepair[];
}

export interface BackfillReportItem {
  setId: string;
  questionId: string;
  sourceContentVersion: string;
  contextFingerprint: string;
  oldKeyTerms: KeyTerm[];
  newKeyTerms: KeyTerm[];
}

interface SnapshotAudit {
  repairable: number;
  alreadyRepaired: number;
  unmatchedLegacy: number;
  unmatched: Array<{
    snapshotId: string;
    assignmentId: string;
    questionId: string;
    questionSetId: string | null;
  }>;
}

interface BackfillReport {
  version: 1;
  status: "preview_in_progress" | "preview_complete" | "applied";
  generatedAt: string;
  appliedAt?: string;
  model: string;
  sourceCount: number;
  inputTokens: number;
  outputTokens: number;
  snapshotAudit: SnapshotAudit;
  items: BackfillReportItem[];
}

interface BatchUsage {
  inputTokens: number;
  outputTokens: number;
}

interface BatchResponse {
  decisions: KeyTermDecision[];
  usage: BatchUsage;
}

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function csv(value: string | undefined): string[] {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

function positiveInteger(value: string | undefined, flag: string): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function defaultReportPath(): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  return resolve(`.backfill/short-answer-key-terms-${timestamp}.json`);
}

export function parseArgs(args: string[]): CliOptions {
  const valueAfter = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    if (index < 0) return undefined;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value`);
    }
    return value;
  };
  const apply = args.includes("--apply");
  const confirmation = valueAfter("--confirm") ?? null;
  if (apply && confirmation !== APPLY_CONFIRMATION) {
    throw new Error(
      `--apply requires --confirm ${APPLY_CONFIRMATION}`,
    );
  }
  const batchSize = positiveInteger(valueAfter("--batch-size"), "--batch-size")
    ?? DEFAULT_BATCH_SIZE;
  return {
    model: valueAfter("--model") ?? DEFAULT_MODEL,
    batchSize,
    limit: positiveInteger(valueAfter("--limit"), "--limit"),
    sets: csv(valueAfter("--sets")),
    questions: csv(valueAfter("--questions")),
    reportPath: resolve(valueAfter("--report") ?? defaultReportPath()),
    fromReport: valueAfter("--from-report")
      ? resolve(valueAfter("--from-report") as string)
      : null,
    apply,
    confirmation,
    verbose: args.includes("--verbose"),
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

function cloneKeyTerms(terms: readonly KeyTerm[]): KeyTerm[] {
  return terms.map((term) => ({
    term: term.term.trim(),
    definition: term.definition.trim(),
  }));
}

function readKeyTerms(value: unknown): KeyTerm[] | null {
  if (!Array.isArray(value)) return null;
  const terms: KeyTerm[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.term !== "string" ||
      typeof entry.definition !== "string"
    ) {
      return null;
    }
    terms.push({ term: entry.term.trim(), definition: entry.definition.trim() });
  }
  return terms;
}

function readKeyTermRepairs(value: unknown): KeyTermRepair[] | null {
  if (!Array.isArray(value)) return null;
  const terms: KeyTermRepair[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.originalTerm !== "string" ||
      typeof entry.term !== "string" ||
      typeof entry.definition !== "string"
    ) {
      return null;
    }
    terms.push({
      originalTerm: entry.originalTerm.trim(),
      term: entry.term.trim(),
      definition: entry.definition.trim(),
    });
  }
  return terms;
}

function shortAnswerFromPayload(payload: unknown): ShortAnswerItem | null {
  if (!isRecord(payload) || payload.questionType !== "open-ended") return null;
  if (!isRecord(payload.shortAnswer)) return null;
  return payload.shortAnswer as unknown as ShortAnswerItem;
}

function contextFingerprint(item: ShortAnswerItem): string {
  const withoutKeyTerms = { ...item, keyTerms: [] };
  return createHash("sha256")
    .update(JSON.stringify(withoutKeyTerms))
    .digest("hex");
}

function questionSetIdFromPayload(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  return typeof payload.questionSetId === "string" && payload.questionSetId.trim()
    ? payload.questionSetId
    : null;
}

function candidateFromRow(row: GeneratedQuestionRow): Candidate | null {
  if (!isRecord(row.payload)) return null;
  const item = shortAnswerFromPayload(row.payload);
  if (!item) return null;
  const validationError = validateShortAnswerItem(item);
  if (!validationError?.startsWith(LEGACY_ERROR_PREFIX)) return null;
  const oldKeyTerms = readKeyTerms(item.keyTerms);
  if (!oldKeyTerms?.length) return null;
  return {
    setId: row.set_id,
    questionId: row.id,
    contentVersion: row.content_version,
    payload: row.payload,
    item,
    oldKeyTerms,
    contextFingerprint: contextFingerprint(item),
  };
}

function key(setId: string, questionId: string): string {
  return `${setId}\0${questionId}`;
}

function keyTermsEqual(left: readonly KeyTerm[], right: readonly KeyTerm[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (term, index) =>
        term.term === right[index]?.term &&
        term.definition === right[index]?.definition,
    )
  );
}

function duplicateLegacyDefinitions(terms: readonly KeyTerm[]): Set<string> {
  const counts = new Map<string, number>();
  for (const term of terms) {
    const definition = normalize(term.definition);
    counts.set(definition, (counts.get(definition) ?? 0) + 1);
  }
  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([definition]) => definition),
  );
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

function isSafeTermCorrection(original: string, repaired: string): boolean {
  const normalizedOriginal = normalize(original);
  const normalizedRepaired = normalize(repaired);
  if (normalizedOriginal === normalizedRepaired) return true;
  const distance = editDistance(normalizedOriginal, normalizedRepaired);
  if (distance <= 2) return true;
  const originalWords = normalizedOriginal.match(/[a-z0-9]+/g) ?? [];
  const repairedWords = new Set(normalizedRepaired.match(/[a-z0-9]+/g) ?? []);
  const sharedWords = originalWords.filter((word) => repairedWords.has(word)).length;
  const retainedRatio = originalWords.length
    ? sharedWords / originalWords.length
    : 0;
  const editRatio = distance / Math.max(normalizedOriginal.length, normalizedRepaired.length);
  return retainedRatio >= 0.5 && editRatio <= 0.5;
}

export function canonicalizeLegacyTerms(
  oldTerms: readonly KeyTerm[],
  repairedTerms: readonly KeyTerm[],
): KeyTerm[] {
  const splitCount = oldTerms.filter((term) => {
    const normalized = normalize(term.term).replaceAll(/\s*\.\s*/g, ". ");
    return (
      normalized === "nadph. proton battery" ||
      normalized === "transpiration. effectors"
    );
  }).length;
  if (repairedTerms.length === oldTerms.length + splitCount && splitCount > 0) {
    return cloneKeyTerms(repairedTerms);
  }
  if (oldTerms.length !== repairedTerms.length) {
    throw new Error("Cannot canonicalize key terms with mismatched lengths");
  }
  return oldTerms.flatMap((oldTerm, index) => {
    const repaired = repairedTerms[index];
    if (!repaired) return [];
    switch (normalize(oldTerm.term).replaceAll(/\s*\.\s*/g, ". ")) {
      case "nadph. proton battery":
        return [
          {
            term: "NADPH",
            definition:
              "An electron carrier that transfers high-energy electrons and hydrogen from the light-dependent reactions to the Calvin cycle.",
          },
          {
            term: "proton gradient",
            definition:
              "A difference in hydrogen ion concentration across a membrane that stores potential energy used to drive ATP production.",
          },
        ];
      case "transpiration. effectors":
        return [
          {
            term: "transpiration",
            definition:
              "The loss of water vapor from plant surfaces, mainly through stomata in leaves.",
          },
          {
            term: "effectors",
            definition:
              "Muscles, glands, cells, or other structures that carry out a response directed by a control system.",
          },
        ];
      case "proton battery":
        return [
          {
            term: "proton gradient",
            definition:
              "A difference in hydrogen ion concentration across a membrane that stores potential energy used to drive ATP production.",
          },
        ];
      default:
        return [{ ...repaired }];
    }
  });
}

export function validateDecision(
  candidate: Pick<Candidate, "setId" | "questionId" | "item" | "oldKeyTerms">,
  decision: KeyTermDecision,
): KeyTerm[] {
  if (
    decision.setId !== candidate.setId ||
    decision.questionId !== candidate.questionId
  ) {
    throw new Error(`Unexpected decision identity for ${candidate.questionId}`);
  }
  const expectedTerms = candidate.oldKeyTerms.map((term) => normalize(term.term));
  const actualTerms = decision.keyTerms.map((term) => normalize(term.originalTerm));
  if (
    expectedTerms.length !== actualTerms.length ||
    new Set(actualTerms).size !== actualTerms.length ||
    expectedTerms.some((term) => !actualTerms.includes(term))
  ) {
    throw new Error(
      `Generated terms do not exactly match stored terms for ${candidate.setId}/${candidate.questionId}`,
    );
  }
  const byTerm = new Map(
    decision.keyTerms.map((term) => [normalize(term.originalTerm), term]),
  );
  const legacyDefinitions = duplicateLegacyDefinitions(candidate.oldKeyTerms);
  const definitions = new Set<string>();
  const repairedTerms = new Set<string>();
  const repaired = candidate.oldKeyTerms.map((oldTerm) => {
    const generated = byTerm.get(normalize(oldTerm.term));
    const definition = generated?.definition.trim() ?? "";
    if (definition.length < 10 || definition.length > 500) {
      throw new Error(
        `Definition length is invalid for "${oldTerm.term}" in ${candidate.questionId}`,
      );
    }
    const normalizedDefinition = normalize(definition);
    if (definitions.has(normalizedDefinition)) {
      throw new Error(`Generated definitions are duplicated in ${candidate.questionId}`);
    }
    if (legacyDefinitions.has(normalizedDefinition)) {
      throw new Error(
        `Generated definition reuses the legacy KC statement in ${candidate.questionId}`,
      );
    }
    const repairedTerm = generated?.term.trim() ?? "";
    if (!repairedTerm) {
      throw new Error(`Generated term is empty for "${oldTerm.term}"`);
    }
    if (!isSafeTermCorrection(oldTerm.term, repairedTerm)) {
      throw new Error(
        `Generated term changes more than a spelling correction: "${oldTerm.term}" -> "${repairedTerm}"`,
      );
    }
    if (repairedTerms.has(normalize(repairedTerm))) {
      throw new Error(`Generated terms are duplicated in ${candidate.questionId}`);
    }
    repairedTerms.add(normalize(repairedTerm));
    definitions.add(normalizedDefinition);
    return { term: repairedTerm, definition };
  });
  const canonicalTerms = canonicalizeLegacyTerms(candidate.oldKeyTerms, repaired);
  const repairedItem = { ...candidate.item, keyTerms: canonicalTerms };
  const validationError = validateShortAnswerItem(repairedItem);
  if (validationError) {
    throw new Error(
      `Repaired item remains invalid for ${candidate.setId}/${candidate.questionId}: ${validationError}`,
    );
  }
  return canonicalTerms;
}

function promptQuestion(candidate: Candidate) {
  return {
    setId: candidate.setId,
    questionId: candidate.questionId,
    stem: candidate.item.stem,
    stimulus: candidate.item.stimulus
      ? {
          type: candidate.item.stimulus.type,
          title: candidate.item.stimulus.title,
          description:
            "scenarioText" in candidate.item.stimulus
              ? candidate.item.stimulus.scenarioText
              : undefined,
          table:
            "tableMarkdown" in candidate.item.stimulus
              ? candidate.item.stimulus.tableMarkdown
              : undefined,
        }
      : null,
    parts: candidate.item.parts.map((part) => ({
      label: part.label,
      prompt: part.prompt,
      scoringGuidance: part.scoringGuidance,
      rubric: part.rubric,
    })),
    kcCodes: Array.from(
      new Set([
        candidate.item.blueprint.anchorKc,
        candidate.item.blueprint.coreKc,
        ...candidate.item.blueprint.selectedKcs,
        ...candidate.item.blueprint.supportingKcs,
      ]),
    ),
    terms: candidate.oldKeyTerms.map((term) => term.term),
  };
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decisions"],
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["setId", "questionId", "keyTerms"],
        properties: {
          setId: { type: "string" },
          questionId: { type: "string" },
          keyTerms: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["originalTerm", "term", "definition"],
              properties: {
                originalTerm: { type: "string" },
                term: { type: "string" },
                definition: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

function parseBatchResponse(raw: string): KeyTermDecision[] {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || !Array.isArray(parsed.decisions)) {
    throw new Error("Model response is missing decisions");
  }
  return parsed.decisions.map((decision) => {
    if (
      !isRecord(decision) ||
      typeof decision.setId !== "string" ||
      typeof decision.questionId !== "string"
    ) {
      throw new Error("Model response contains an invalid decision identity");
    }
    const keyTerms = readKeyTermRepairs(decision.keyTerms);
    if (!keyTerms) throw new Error("Model response contains invalid keyTerms");
    return {
      setId: decision.setId,
      questionId: decision.questionId,
      keyTerms,
    };
  });
}

async function generateBatch(
  client: OpenAI,
  model: string,
  candidates: readonly Candidate[],
): Promise<BatchResponse> {
  const prompt = JSON.stringify({
    task:
      "Write a concise, term-specific biology definition for every supplied term. Definitions must explain the term itself, be accurate in the question context, be suitable for high-school students, avoid circular wording, and not copy a broad KC statement. Return every original term exactly once as originalTerm. Preserve term unless it has a clear spelling error; when it does, put the corrected spelling in term. Do not add, remove, merge, or replace concepts.",
    questions: candidates.map(promptQuestion),
  });
  let lastError = "Unknown model error";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "short_answer_key_term_backfill",
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
        messages: [
          {
            role: "system",
            content:
              "You are an expert high-school biology curriculum editor. Produce precise instructional glossary definitions as structured JSON.",
          },
          { role: "user", content: prompt },
        ],
      });
      const raw = response.choices[0]?.message.content;
      if (!raw) throw new Error("Model returned no content");
      const decisions = parseBatchResponse(raw);
      if (decisions.length !== candidates.length) {
        throw new Error("Model did not return exactly one decision per question");
      }
      const decisionByKey = new Map(
        decisions.map((decision) => [key(decision.setId, decision.questionId), decision]),
      );
      for (const candidate of candidates) {
        const decision = decisionByKey.get(key(candidate.setId, candidate.questionId));
        if (!decision) throw new Error(`Missing decision for ${candidate.questionId}`);
        validateDecision(candidate, decision);
      }
      return {
        decisions,
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_RETRIES) {
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, 1_000 * 2 ** (attempt - 1)),
        );
      }
    }
  }
  throw new Error(
    `Key-term generation failed after ${MAX_RETRIES} attempts: ${lastError}`,
  );
}

async function selectAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
  }
}

async function loadCandidates(
  db: SupabaseClient,
  options: CliOptions,
): Promise<Candidate[]> {
  const rows = await selectAllPages<GeneratedQuestionRow>((from, to) => {
    let query = db
      .from("generated_questions")
      .select("id,set_id,payload,content_version")
      .eq("payload->>questionType", "open-ended")
      .order("set_id", { ascending: true })
      .order("id", { ascending: true });
    if (options.sets.length) query = query.in("set_id", options.sets);
    if (options.questions.length) query = query.in("id", options.questions);
    return query.range(from, to);
  });
  const candidates = rows
    .map(candidateFromRow)
    .filter((candidate): candidate is Candidate => candidate !== null);
  return options.limit ? candidates.slice(0, options.limit) : candidates;
}

function replaceKeyTerms(
  payload: Record<string, unknown>,
  keyTerms: readonly KeyTerm[],
): Record<string, unknown> {
  if (!isRecord(payload.shortAnswer)) {
    throw new Error("Question payload is missing shortAnswer");
  }
  return {
    ...payload,
    shortAnswer: {
      ...payload.shortAnswer,
      keyTerms: cloneKeyTerms(keyTerms),
    },
  };
}

async function loadSnapshots(db: SupabaseClient): Promise<SnapshotRow[]> {
  return selectAllPages<SnapshotRow>((from, to) =>
    db
      .from("assignment_question_snapshots")
      .select("id,assignment_id,question_id,payload")
      .eq("payload->>questionType", "open-ended")
      .order("id", { ascending: true })
      .range(from, to),
  );
}

function auditSnapshots(
  snapshots: readonly SnapshotRow[],
  reportItems: readonly BackfillReportItem[],
): SnapshotAudit {
  const byKey = new Map(
    reportItems.map((item) => [key(item.setId, item.questionId), item]),
  );
  const audit: SnapshotAudit = {
    repairable: 0,
    alreadyRepaired: 0,
    unmatchedLegacy: 0,
    unmatched: [],
  };
  for (const snapshot of snapshots) {
    const item = shortAnswerFromPayload(snapshot.payload);
    if (!item) continue;
    const validationError = validateShortAnswerItem(item);
    const setId = questionSetIdFromPayload(snapshot.payload);
    const reportItem = setId
      ? byKey.get(key(setId, snapshot.question_id))
      : undefined;
    const terms = readKeyTerms(item.keyTerms);
    if (reportItem && terms && keyTermsEqual(terms, reportItem.newKeyTerms)) {
      audit.alreadyRepaired += 1;
      continue;
    }
    if (!validationError?.startsWith(LEGACY_ERROR_PREFIX)) continue;
    if (
      reportItem &&
      terms &&
      keyTermsEqual(terms, reportItem.oldKeyTerms) &&
      contextFingerprint(item) === reportItem.contextFingerprint
    ) {
      audit.repairable += 1;
      continue;
    }
    audit.unmatchedLegacy += 1;
    audit.unmatched.push({
      snapshotId: snapshot.id,
      assignmentId: snapshot.assignment_id,
      questionId: snapshot.question_id,
      questionSetId: setId,
    });
  }
  return audit;
}

async function writeReport(path: string, report: BackfillReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function parseReport(value: unknown): BackfillReport {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.items) ||
    typeof value.model !== "string"
  ) {
    throw new Error("Invalid key-term backfill report");
  }
  const report = value as unknown as BackfillReport;
  return {
    ...report,
    items: report.items.map((item) => ({
      ...item,
      newKeyTerms: canonicalizeLegacyTerms(item.oldKeyTerms, item.newKeyTerms),
    })),
  };
}

async function readReport(path: string): Promise<BackfillReport> {
  return parseReport(JSON.parse(await readFile(path, "utf8")) as unknown);
}

async function preflightGeneratedQuestions(
  db: SupabaseClient,
  items: readonly BackfillReportItem[],
): Promise<void> {
  for (const item of items) {
    const { data: row, error } = await db
      .from("generated_questions")
      .select("id,set_id,payload,content_version")
      .eq("set_id", item.setId)
      .eq("id", item.questionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || !isRecord(row.payload)) {
      throw new Error(`Question disappeared: ${item.setId}/${item.questionId}`);
    }
    const currentItem = shortAnswerFromPayload(row.payload);
    const currentTerms = currentItem ? readKeyTerms(currentItem.keyTerms) : null;
    if (currentTerms && keyTermsEqual(currentTerms, item.newKeyTerms)) continue;
    if (
      row.content_version !== item.sourceContentVersion ||
      !currentItem ||
      !currentTerms ||
      !keyTermsEqual(currentTerms, item.oldKeyTerms) ||
      contextFingerprint(currentItem) !== item.contextFingerprint
    ) {
      throw new Error(
        `Question changed after preview; regenerate the report: ${item.setId}/${item.questionId}`,
      );
    }
    const repairedItem = shortAnswerFromPayload(
      replaceKeyTerms(row.payload, item.newKeyTerms),
    );
    const validationError = repairedItem
      ? validateShortAnswerItem(repairedItem)
      : "updated payload is not a short-answer item";
    if (validationError) {
      throw new Error(
        `Report contains an invalid repair for ${item.setId}/${item.questionId}: ${validationError}`,
      );
    }
  }
}

async function applyGeneratedQuestions(
  db: SupabaseClient,
  items: readonly BackfillReportItem[],
): Promise<{ updated: number; alreadyApplied: number }> {
  let updated = 0;
  let alreadyApplied = 0;
  for (const item of items) {
    const { data: row, error } = await db
      .from("generated_questions")
      .select("id,set_id,payload,content_version")
      .eq("set_id", item.setId)
      .eq("id", item.questionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || !isRecord(row.payload)) {
      throw new Error(`Question disappeared: ${item.setId}/${item.questionId}`);
    }
    const currentItem = shortAnswerFromPayload(row.payload);
    const currentTerms = currentItem ? readKeyTerms(currentItem.keyTerms) : null;
    if (currentTerms && keyTermsEqual(currentTerms, item.newKeyTerms)) {
      alreadyApplied += 1;
      continue;
    }
    if (
      row.content_version !== item.sourceContentVersion ||
      !currentItem ||
      !currentTerms ||
      !keyTermsEqual(currentTerms, item.oldKeyTerms) ||
      contextFingerprint(currentItem) !== item.contextFingerprint
    ) {
      throw new Error(
        `Question changed after preview; regenerate the report: ${item.setId}/${item.questionId}`,
      );
    }
    const payload = replaceKeyTerms(row.payload, item.newKeyTerms);
    const repairedItem = shortAnswerFromPayload(payload);
    const validationError = repairedItem
      ? validateShortAnswerItem(repairedItem)
      : "updated payload is not a short-answer item";
    if (validationError) {
      throw new Error(
        `Report contains an invalid repair for ${item.setId}/${item.questionId}: ${validationError}`,
      );
    }
    const { data: changed, error: updateError } = await db
      .from("generated_questions")
      .update({ payload })
      .eq("set_id", item.setId)
      .eq("id", item.questionId)
      .eq("content_version", item.sourceContentVersion)
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!changed) {
      throw new Error(
        `Concurrent update detected: ${item.setId}/${item.questionId}`,
      );
    }
    updated += 1;
  }
  return { updated, alreadyApplied };
}

async function applySnapshots(
  db: SupabaseClient,
  snapshots: readonly SnapshotRow[],
  items: readonly BackfillReportItem[],
): Promise<{ updated: number; alreadyApplied: number }> {
  const byKey = new Map(items.map((item) => [key(item.setId, item.questionId), item]));
  let updated = 0;
  let alreadyApplied = 0;
  for (const snapshot of snapshots) {
    const setId = questionSetIdFromPayload(snapshot.payload);
    if (!setId || !isRecord(snapshot.payload)) continue;
    const reportItem = byKey.get(key(setId, snapshot.question_id));
    if (!reportItem) continue;
    const currentItem = shortAnswerFromPayload(snapshot.payload);
    const currentTerms = currentItem ? readKeyTerms(currentItem.keyTerms) : null;
    if (currentTerms && keyTermsEqual(currentTerms, reportItem.newKeyTerms)) {
      alreadyApplied += 1;
      continue;
    }
    if (
      !currentItem ||
      !currentTerms ||
      !keyTermsEqual(currentTerms, reportItem.oldKeyTerms) ||
      contextFingerprint(currentItem) !== reportItem.contextFingerprint
    ) {
      continue;
    }
    const payload = replaceKeyTerms(snapshot.payload, reportItem.newKeyTerms);
    const { error } = await db
      .from("assignment_question_snapshots")
      .update({ payload })
      .eq("id", snapshot.id);
    if (error) throw new Error(error.message);
    updated += 1;
  }
  return { updated, alreadyApplied };
}

async function createPreview(
  db: SupabaseClient,
  options: CliOptions,
): Promise<BackfillReport> {
  const candidates = await loadCandidates(db, options);
  const report: BackfillReport = {
    version: 1,
    status: "preview_in_progress",
    generatedAt: new Date().toISOString(),
    model: options.model,
    sourceCount: candidates.length,
    inputTokens: 0,
    outputTokens: 0,
    snapshotAudit: {
      repairable: 0,
      alreadyRepaired: 0,
      unmatchedLegacy: 0,
      unmatched: [],
    },
    items: [],
  };
  await writeReport(options.reportPath, report);
  if (!candidates.length) return { ...report, status: "preview_complete" };

  const client = new OpenAI({ apiKey: getOpenAIKey() });
  for (let offset = 0; offset < candidates.length; offset += options.batchSize) {
    const batch = candidates.slice(offset, offset + options.batchSize);
    const response = await generateBatch(client, options.model, batch);
    const decisionByKey = new Map(
      response.decisions.map((decision) => [key(decision.setId, decision.questionId), decision]),
    );
    for (const candidate of batch) {
      const decision = decisionByKey.get(key(candidate.setId, candidate.questionId));
      if (!decision) throw new Error(`Missing decision for ${candidate.questionId}`);
      report.items.push({
        setId: candidate.setId,
        questionId: candidate.questionId,
        sourceContentVersion: candidate.contentVersion,
        contextFingerprint: candidate.contextFingerprint,
        oldKeyTerms: cloneKeyTerms(candidate.oldKeyTerms),
        newKeyTerms: validateDecision(candidate, decision),
      });
    }
    report.inputTokens += response.usage.inputTokens;
    report.outputTokens += response.usage.outputTokens;
    await writeReport(options.reportPath, report);
    console.log(`Generated ${report.items.length}/${candidates.length}`);
  }
  report.snapshotAudit = auditSnapshots(await loadSnapshots(db), report.items);
  report.status = "preview_complete";
  await writeReport(options.reportPath, report);
  return report;
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const db = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const report = options.fromReport
    ? await readReport(options.fromReport)
    : await createPreview(db, options);
  const reportPath = options.fromReport ?? options.reportPath;
  if (options.fromReport) {
    await preflightGeneratedQuestions(db, report.items);
    report.snapshotAudit = auditSnapshots(await loadSnapshots(db), report.items);
    await writeReport(reportPath, report);
  }

  console.log(`Mode: ${options.apply ? "apply" : "dry-run"}`);
  console.log(`Model: ${report.model}`);
  console.log(`Generated questions: ${report.items.length}`);
  console.log(`Repairable assignment snapshots: ${report.snapshotAudit.repairable}`);
  console.log(`Unmatched legacy snapshots: ${report.snapshotAudit.unmatchedLegacy}`);
  console.log(`Input tokens: ${report.inputTokens}`);
  console.log(`Output tokens: ${report.outputTokens}`);
  console.log(`Report: ${reportPath}`);

  if (!options.apply) {
    if (options.fromReport) await writeReport(reportPath, report);
    console.log("Database changes: 0 (pass --apply with the required confirmation after review)");
    return;
  }
  if (report.status !== "preview_complete" && report.status !== "applied") {
    throw new Error("Only a complete preview report can be applied");
  }
  const snapshots = await loadSnapshots(db);
  const currentAudit = auditSnapshots(snapshots, report.items);
  if (currentAudit.unmatchedLegacy > 0) {
    throw new Error(
      `Apply blocked: ${currentAudit.unmatchedLegacy} legacy assignment snapshots do not match the preview`,
    );
  }
  await preflightGeneratedQuestions(db, report.items);
  const generated = await applyGeneratedQuestions(db, report.items);
  const snapshotResult = await applySnapshots(db, snapshots, report.items);
  report.status = "applied";
  report.appliedAt = new Date().toISOString();
  report.snapshotAudit = auditSnapshots(await loadSnapshots(db), report.items);
  await writeReport(reportPath, report);
  console.log(`Updated generated questions: ${generated.updated}`);
  console.log(`Already-updated generated questions: ${generated.alreadyApplied}`);
  console.log(`Updated assignment snapshots: ${snapshotResult.updated}`);
  console.log(`Already-updated assignment snapshots: ${snapshotResult.alreadyApplied}`);
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (entrypoint === import.meta.url) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Key-term backfill failed");
    process.exitCode = 1;
  });
}
