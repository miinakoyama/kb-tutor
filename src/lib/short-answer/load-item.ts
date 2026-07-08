/**
 * Server-side resolution of a short-answer item + part for grading.
 * Reads the payload from the assignment snapshot when an assignmentId is
 * supplied, otherwise from generated_questions. Uses the caller's session
 * client so RLS still scopes access. Returns null when the question is not a
 * valid short-answer item (route responds 404).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PartLabel, ShortAnswerItem, ShortAnswerPart } from "@/types/short-answer";
import { isShortAnswerItem } from "@/lib/short-answer/item-schema";

interface StoredPayload {
  questionType?: string;
  shortAnswer?: unknown;
}

function extractShortAnswer(payload: unknown): ShortAnswerItem | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as StoredPayload;
  if (record.questionType !== "open-ended") return null;
  if (!isShortAnswerItem(record.shortAnswer)) return null;
  return record.shortAnswer;
}

export interface LoadedItem {
  item: ShortAnswerItem;
  part: ShortAnswerPart;
}

export async function loadShortAnswerPart(
  supabase: SupabaseClient,
  params: {
    questionId: string;
    partLabel: PartLabel;
    assignmentId?: string | null;
  },
): Promise<LoadedItem | null> {
  const { questionId, partLabel, assignmentId } = params;

  let payload: unknown = null;

  if (assignmentId) {
    const { data } = await supabase
      .from("assignment_question_snapshots")
      .select("payload")
      .eq("assignment_id", assignmentId)
      .eq("question_id", questionId)
      .maybeSingle();
    payload = data?.payload ?? null;
  } else {
    const { data } = await supabase
      .from("generated_questions")
      .select("payload")
      .eq("id", questionId)
      .maybeSingle();
    payload = data?.payload ?? null;
  }

  const item = extractShortAnswer(payload);
  if (!item) return null;

  const part = item.parts.find((p) => p.label === partLabel);
  if (!part) return null;

  return { item, part };
}
