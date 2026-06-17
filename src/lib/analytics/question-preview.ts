import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ANALYTICS_IN_FILTER_CHUNK_SIZE,
  ANALYTICS_PAGE_SIZE,
  chunkArray,
} from "@/lib/analytics/pagination";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export interface QuestionOptionPreview {
  id: string;
  text: string;
}

export interface QuestionPreview {
  text: string;
  imageUrl: string | null;
  options: QuestionOptionPreview[];
  correctOptionId: string;
}

interface GeneratedQuestionRow {
  id: string;
  payload: unknown;
  updated_at: string;
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

  return { text, imageUrl, options, correctOptionId };
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
