import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ANALYTICS_IN_FILTER_CHUNK_SIZE,
  ANALYTICS_PAGE_SIZE,
  chunkArray,
} from "@/lib/analytics/pagination";
import type { PartLabel } from "@/types/short-answer";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export interface QuestionOptionPreview {
  id: string;
  text: string;
}

export interface McqQuestionPreview {
  questionType: "mcq";
  text: string;
  imageUrl: string | null;
  options: QuestionOptionPreview[];
  correctOptionId: string;
}

export interface OpenEndedPartPreview {
  label: PartLabel;
  prompt: string;
  maxScore: number;
}

export interface OpenEndedQuestionPreview {
  questionType: "open-ended";
  text: string;
  imageUrl: string | null;
  parts: OpenEndedPartPreview[];
}

export type QuestionPreview = McqQuestionPreview | OpenEndedQuestionPreview;
export type QuestionType = QuestionPreview["questionType"];

const PART_LABELS = new Set<PartLabel>(["A", "B", "C"]);

function isPartLabel(value: unknown): value is PartLabel {
  return typeof value === "string" && PART_LABELS.has(value as PartLabel);
}

interface GeneratedQuestionRow {
  id: string;
  payload: unknown;
  updated_at: string;
}

interface GeneratedQuestionIdentityRow extends GeneratedQuestionRow {
  set_id: string;
}

interface GeneratedQuestionVersionRow {
  question_id: string;
  question_set_id: string;
  payload: unknown;
  captured_at: string;
}

interface SnapshotQuestionRow {
  question_id: string;
  payload: unknown;
  created_at: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseOpenEndedPreview(
  source: Record<string, unknown>,
): OpenEndedQuestionPreview | null {
  const shortAnswer = asRecord(source.shortAnswer);
  if (!shortAnswer) return null;

  const stemRaw = shortAnswer.stem;
  const text = typeof stemRaw === "string" ? stemRaw.trim() : "";
  if (!text) return null;

  const partsRaw = Array.isArray(shortAnswer.parts) ? shortAnswer.parts : [];
  const parts = partsRaw
    .map((entry) => {
      const part = asRecord(entry);
      if (!part) return null;
      if (!isPartLabel(part.label)) return null;
      const prompt = typeof part.prompt === "string" ? part.prompt.trim() : "";
      if (!prompt) return null;
      const maxScore = typeof part.maxScore === "number" ? part.maxScore : 0;
      return { label: part.label, prompt, maxScore };
    })
    .filter((entry): entry is OpenEndedPartPreview => entry !== null);

  if (parts.length === 0) return null;

  return { questionType: "open-ended", text, imageUrl: null, parts };
}

function parseMcqPreview(source: Record<string, unknown>): McqQuestionPreview | null {
  const textRaw = source.text;
  const text = typeof textRaw === "string" ? textRaw.trim() : "";
  if (!text) return null;

  const optionsRaw = Array.isArray(source.options) ? source.options : [];
  const options = optionsRaw
    .map((entry, index) => {
      const option = asRecord(entry);
      if (!option) return null;
      const idRaw = option.id;
      const textValue = typeof option.text === "string" ? option.text.trim() : "";
      if (!textValue) return null;
      const id =
        typeof idRaw === "string" && idRaw.trim().length > 0
          ? idRaw
          : `opt_${index + 1}`;
      return { id, text: textValue };
    })
    .filter((entry): entry is QuestionOptionPreview => entry !== null);

  if (options.length === 0) return null;

  const correctRaw = source.correctOptionId;
  const fallbackCorrectId = options[0]?.id ?? "opt_1";
  const correctOptionId =
    typeof correctRaw === "string" && options.some((option) => option.id === correctRaw)
      ? correctRaw
      : fallbackCorrectId;

  const imageUrl =
    typeof source.imageUrl === "string" && source.imageUrl.trim().length > 0
      ? source.imageUrl
      : null;

  return { questionType: "mcq", text, imageUrl, options, correctOptionId };
}

export function parseQuestionPreview(raw: unknown): QuestionPreview | null {
  const source = asRecord(raw);
  if (!source) return null;

  if (source.questionType === "open-ended") {
    return parseOpenEndedPreview(source);
  }
  return parseMcqPreview(source);
}

/**
 * Persisted completion summaries are authoritative for historical question
 * format. A preview can disappear or become unparseable after the response was
 * recorded, but `selected_option_id = short-answer` remains durable evidence.
 */
export function resolveQuestionTypeFromAttempts(
  attempts: ReadonlyArray<{ selected_option_id: string | null }>,
  preview: QuestionPreview | null,
): QuestionType | null {
  if (
    attempts.some(
      (attempt) => attempt.selected_option_id === "short-answer",
    )
  ) {
    return "open-ended";
  }
  if (attempts.length > 0) return "mcq";
  return preview?.questionType ?? null;
}

export interface QuestionPreviewIdentity {
  questionId: string;
  questionSetId: string | null;
}

export function questionPreviewIdentityKey(
  identity: QuestionPreviewIdentity,
): string {
  return JSON.stringify([identity.questionSetId, identity.questionId]);
}

/**
 * Fetch question previews for the given question ids, preferring the latest
 * `generated_questions` payload and falling back to
 * `assignment_question_snapshots` for questions that have since been removed
 * from the bank.
 */
export async function fetchQuestionPreviews(
  admin: SupabaseAdminClient,
  questionIds: string[],
): Promise<{ data: Map<string, QuestionPreview>; error: string | null }> {
  const previewByQuestionId = new Map<string, { preview: QuestionPreview; timestamp: string }>();

  for (const chunk of chunkArray(questionIds, ANALYTICS_IN_FILTER_CHUNK_SIZE)) {
    for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
      const { data: page, error } = await admin
        .from("generated_questions")
        .select("id,payload,updated_at")
        .in("id", chunk)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + ANALYTICS_PAGE_SIZE - 1);
      if (error) return { data: new Map(), error: error.message };
      const rows = (page ?? []) as GeneratedQuestionRow[];
      for (const row of rows) {
        const questionId = String(row.id);
        const preview = parseQuestionPreview(row.payload);
        if (!preview) continue;
        const existing = previewByQuestionId.get(questionId);
        if (!existing || row.updated_at > existing.timestamp) {
          previewByQuestionId.set(questionId, { preview, timestamp: row.updated_at });
        }
      }
      if (rows.length < ANALYTICS_PAGE_SIZE) break;
    }
  }

  const missingQuestionIds = questionIds.filter((id) => !previewByQuestionId.has(id));
  for (const chunk of chunkArray(missingQuestionIds, ANALYTICS_IN_FILTER_CHUNK_SIZE)) {
    for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
      const { data: page, error } = await admin
        .from("assignment_question_snapshots")
        .select("question_id,payload,created_at")
        .in("question_id", chunk)
        .order("created_at", { ascending: false })
        .order("question_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + ANALYTICS_PAGE_SIZE - 1);
      if (error) return { data: new Map(), error: error.message };
      const rows = (page ?? []) as SnapshotQuestionRow[];
      for (const row of rows) {
        const questionId = String(row.question_id);
        if (previewByQuestionId.has(questionId)) continue;
        const preview = parseQuestionPreview(row.payload);
        if (!preview) continue;
        previewByQuestionId.set(questionId, { preview, timestamp: row.created_at });
      }
      if (rows.length < ANALYTICS_PAGE_SIZE) break;
    }
  }

  const result = new Map<string, QuestionPreview>();
  for (const [questionId, { preview }] of previewByQuestionId) {
    result.set(questionId, preview);
  }
  return { data: result, error: null };
}

/**
 * Fetches previews by the persisted composite question identity. Current bank
 * rows are preferred, with version history as a set-aware fallback. Legacy
 * attempts without a set id retain the older id-only lookup behavior.
 */
export async function fetchQuestionPreviewsByIdentity(
  admin: SupabaseAdminClient,
  identities: QuestionPreviewIdentity[],
): Promise<{ data: Map<string, QuestionPreview>; error: string | null }> {
  const uniqueIdentities = new Map(
    identities.map((identity) => [questionPreviewIdentityKey(identity), identity]),
  );
  const requestedKeys = new Set(uniqueIdentities.keys());
  const resolved = new Map<
    string,
    { preview: QuestionPreview; timestamp: string }
  >();
  const questionIds = Array.from(
    new Set(identities.map((identity) => identity.questionId)),
  );

  for (const chunk of chunkArray(questionIds, ANALYTICS_IN_FILTER_CHUNK_SIZE)) {
    for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
      const { data: page, error } = await admin
        .from("generated_questions")
        .select("id,set_id,payload,updated_at")
        .in("id", chunk)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + ANALYTICS_PAGE_SIZE - 1);
      if (error) return { data: new Map(), error: error.message };
      const rows = (page ?? []) as GeneratedQuestionIdentityRow[];
      for (const row of rows) {
        const key = questionPreviewIdentityKey({
          questionId: String(row.id),
          questionSetId: String(row.set_id),
        });
        if (!requestedKeys.has(key)) continue;
        const preview = parseQuestionPreview(row.payload);
        if (!preview) continue;
        const existing = resolved.get(key);
        if (!existing || row.updated_at > existing.timestamp) {
          resolved.set(key, { preview, timestamp: row.updated_at });
        }
      }
      if (rows.length < ANALYTICS_PAGE_SIZE) break;
    }
  }

  const unresolvedSetIdentities = Array.from(uniqueIdentities.entries())
    .filter(
      ([key, identity]) => identity.questionSetId !== null && !resolved.has(key),
    )
    .map(([, identity]) => identity);
  const unresolvedSetQuestionIds = Array.from(
    new Set(unresolvedSetIdentities.map((identity) => identity.questionId)),
  );
  const unresolvedSetKeys = new Set(
    unresolvedSetIdentities.map(questionPreviewIdentityKey),
  );

  for (const chunk of chunkArray(
    unresolvedSetQuestionIds,
    ANALYTICS_IN_FILTER_CHUNK_SIZE,
  )) {
    for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
      const { data: page, error } = await admin
        .from("generated_question_versions")
        .select("question_id,question_set_id,payload,captured_at")
        .in("question_id", chunk)
        .order("captured_at", { ascending: false })
        .order("question_id", { ascending: true })
        .range(from, from + ANALYTICS_PAGE_SIZE - 1);
      if (error) return { data: new Map(), error: error.message };
      const rows = (page ?? []) as GeneratedQuestionVersionRow[];
      for (const row of rows) {
        const key = questionPreviewIdentityKey({
          questionId: String(row.question_id),
          questionSetId: String(row.question_set_id),
        });
        if (!unresolvedSetKeys.has(key) || resolved.has(key)) continue;
        const preview = parseQuestionPreview(row.payload);
        if (!preview) continue;
        resolved.set(key, { preview, timestamp: row.captured_at });
      }
      if (rows.length < ANALYTICS_PAGE_SIZE) break;
    }
  }

  const legacyIdentities = Array.from(uniqueIdentities.values()).filter(
    (identity) => identity.questionSetId === null,
  );
  if (legacyIdentities.length > 0) {
    const { data: legacyPreviews, error } = await fetchQuestionPreviews(
      admin,
      legacyIdentities.map((identity) => identity.questionId),
    );
    if (error) return { data: new Map(), error };
    for (const identity of legacyIdentities) {
      const preview = legacyPreviews.get(identity.questionId);
      if (preview) {
        resolved.set(questionPreviewIdentityKey(identity), {
          preview,
          timestamp: "",
        });
      }
    }
  }

  return {
    data: new Map(
      Array.from(resolved.entries()).map(([key, value]) => [key, value.preview]),
    ),
    error: null,
  };
}
