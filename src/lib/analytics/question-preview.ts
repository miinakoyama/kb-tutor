import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ANALYTICS_IN_FILTER_CHUNK_SIZE,
  ANALYTICS_PAGE_SIZE,
  chunkArray,
} from "@/lib/analytics/pagination";
import type {
  QuestionPreview,
  QuestionPreviewOption,
} from "@/lib/analytics/teacher-analytics-types";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Best-effort conversion of a stored question payload (from
 * `generated_questions.payload` or `assignment_question_snapshots.payload`)
 * into the canonical `QuestionPreview` shape the analytics UI displays.
 *
 * Returns null when the payload lacks a non-empty stem or any usable
 * option — those rows fall through to the next storage layer in the
 * resolver below.
 */
export function parseQuestionPreview(raw: unknown): QuestionPreview | null {
  const source = asRecord(raw);
  if (!source) return null;

  const textRaw = source.text;
  const text = typeof textRaw === "string" ? textRaw.trim() : "";
  if (!text) return null;

  const optionsRaw = Array.isArray(source.options) ? source.options : [];
  const options = optionsRaw
    .map((entry, index) => {
      const option = asRecord(entry);
      if (!option) return null;
      const idRaw = option.id;
      const textValue =
        typeof option.text === "string" ? option.text.trim() : "";
      if (!textValue) return null;
      const id =
        typeof idRaw === "string" && idRaw.trim().length > 0
          ? idRaw
          : `opt_${index + 1}`;
      return { id, text: textValue };
    })
    .filter((entry): entry is QuestionPreviewOption => entry !== null);

  if (options.length === 0) return null;

  const correctRaw = source.correctOptionId;
  const fallbackCorrectId = options[0]?.id ?? "opt_1";
  const correctOptionId =
    typeof correctRaw === "string" &&
    options.some((option) => option.id === correctRaw)
      ? correctRaw
      : fallbackCorrectId;

  const imageUrl =
    typeof source.imageUrl === "string" && source.imageUrl.trim().length > 0
      ? source.imageUrl
      : null;

  const diagramRaw = asRecord(source.diagram);
  const diagramType = diagramRaw?.type;
  const diagram =
    typeof diagramType === "string" && "data" in (diagramRaw ?? {})
      ? { type: diagramType, data: diagramRaw?.data }
      : null;

  return {
    text,
    imageUrl,
    options,
    correctOptionId,
    diagram,
  };
}

/**
 * Extract the `standardId` recorded inside a generated question payload.
 * Returns `null` when missing or not a string.
 */
export function parseQuestionStandardId(raw: unknown): string | null {
  const source = asRecord(raw);
  if (!source) return null;
  const value = source.standardId;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Resolve previews for many question ids in one call.
 *
 * Lookup order:
 *   1. `generated_questions.payload` (latest by `updated_at`).
 *   2. `assignment_question_snapshots.payload` fallback (latest by
 *      `created_at`).
 *
 * Output map is keyed by `questionId`. Missing or malformed payloads
 * resolve to `null` so callers can render the "preview unavailable"
 * empty state.
 */
export async function resolveQuestionPreviews(input: {
  admin: SupabaseAdminClient;
  questionIds: readonly string[];
}): Promise<Map<string, QuestionPreview | null>> {
  const { admin, questionIds } = input;
  const out = new Map<string, QuestionPreview | null>();
  if (questionIds.length === 0) return out;
  for (const id of questionIds) out.set(id, null);

  const previewByQuestionId = new Map<
    string,
    { preview: QuestionPreview; timestamp: string }
  >();

  for (const chunk of chunkArray(
    questionIds as string[],
    ANALYTICS_IN_FILTER_CHUNK_SIZE,
  )) {
    for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
      const { data, error } = await admin
        .from("generated_questions")
        .select("id,payload,updated_at")
        .in("id", chunk)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + ANALYTICS_PAGE_SIZE - 1);
      if (error) {
        throw new Error(`generated_questions query failed: ${error.message}`);
      }
      const rows = data ?? [];
      for (const row of rows) {
        const questionId = String(row.id);
        const preview = parseQuestionPreview(row.payload);
        if (!preview) continue;
        const timestamp = String(row.updated_at);
        const existing = previewByQuestionId.get(questionId);
        if (!existing || timestamp > existing.timestamp) {
          previewByQuestionId.set(questionId, { preview, timestamp });
        }
      }
      if (rows.length < ANALYTICS_PAGE_SIZE) break;
    }
  }

  const missing = (questionIds as string[]).filter(
    (id) => !previewByQuestionId.has(id),
  );
  if (missing.length > 0) {
    for (const chunk of chunkArray(missing, ANALYTICS_IN_FILTER_CHUNK_SIZE)) {
      for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
        const { data, error } = await admin
          .from("assignment_question_snapshots")
          .select("question_id,payload,created_at")
          .in("question_id", chunk)
          .order("created_at", { ascending: false })
          .order("question_id", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + ANALYTICS_PAGE_SIZE - 1);
        if (error) {
          throw new Error(
            `assignment_question_snapshots query failed: ${error.message}`,
          );
        }
        const rows = data ?? [];
        for (const row of rows) {
          const questionId = String(row.question_id);
          if (previewByQuestionId.has(questionId)) continue;
          const preview = parseQuestionPreview(row.payload);
          if (!preview) continue;
          previewByQuestionId.set(questionId, {
            preview,
            timestamp: String(row.created_at),
          });
        }
        if (rows.length < ANALYTICS_PAGE_SIZE) break;
      }
    }
  }

  for (const [id, entry] of previewByQuestionId) {
    out.set(id, entry.preview);
  }

  return out;
}

/**
 * Resolve the `standardId` recorded in the canonical question payload
 * for many question ids in one call. Order of preference matches
 * `resolveQuestionPreviews` (generated_questions → snapshots).
 */
export async function resolveQuestionStandards(input: {
  admin: SupabaseAdminClient;
  questionIds: readonly string[];
}): Promise<Map<string, string | null>> {
  const { admin, questionIds } = input;
  const out = new Map<string, string | null>();
  if (questionIds.length === 0) return out;
  for (const id of questionIds) out.set(id, null);

  for (const chunk of chunkArray(
    questionIds as string[],
    ANALYTICS_IN_FILTER_CHUNK_SIZE,
  )) {
    for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
      const { data, error } = await admin
        .from("generated_questions")
        .select("id,payload,updated_at")
        .in("id", chunk)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + ANALYTICS_PAGE_SIZE - 1);
      if (error) {
        throw new Error(`generated_questions query failed: ${error.message}`);
      }
      const rows = data ?? [];
      for (const row of rows) {
        const questionId = String(row.id);
        if (out.get(questionId)) continue;
        const standardId = parseQuestionStandardId(row.payload);
        if (standardId) out.set(questionId, standardId);
      }
      if (rows.length < ANALYTICS_PAGE_SIZE) break;
    }
  }

  return out;
}
