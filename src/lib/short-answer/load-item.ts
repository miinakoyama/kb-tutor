/**
 * Server-side resolution of a short-answer item + part for grading.
 * Reads the payload from the assignment snapshot when an assignmentId is
 * supplied, otherwise from generated_questions. Uses the caller's session
 * client so RLS still scopes access. Returns null when the question is not a
 * valid short-answer item (route responds 404), and throws when the database
 * lookup itself fails so callers do not misreport an outage as missing data.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PartLabel, ShortAnswerItem, ShortAnswerPart } from "@/types/short-answer";
import { isShortAnswerItem } from "@/lib/short-answer/item-schema";

interface StoredPayload {
  id?: string;
  questionType?: string;
  shortAnswer?: unknown;
}

function extractShortAnswer(payload: unknown): ShortAnswerItem | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as StoredPayload;
  if (isShortAnswerItem(payload)) return payload;
  if (record.questionType !== "open-ended") return null;
  if (!isShortAnswerItem(record.shortAnswer)) return null;
  return record.shortAnswer;
}

function payloadId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as StoredPayload;
  return typeof record.id === "string" && record.id.trim() ? record.id : null;
}

function payloadQuestionSetId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { questionSetId?: unknown };
  return typeof record.questionSetId === "string" && record.questionSetId.trim()
    ? record.questionSetId
    : null;
}

function matchesSnapshotIdentity(
  payload: unknown,
  questionId: string,
  questionSetId: string | null | undefined,
): boolean {
  return (
    payloadId(payload) === questionId &&
    payloadQuestionSetId(payload) === (questionSetId ?? null)
  );
}

export interface LoadedItem {
  item: ShortAnswerItem;
  part: ShortAnswerPart;
}

export class ShortAnswerItemLoadError extends Error {
  readonly code: string | null;

  constructor(message: string, code?: string | null) {
    super(message);
    this.name = "ShortAnswerItemLoadError";
    this.code = code ?? null;
  }
}

export async function loadShortAnswerPart(
  supabase: SupabaseClient,
  params: {
    questionId: string;
    questionSetId?: string | null;
    partLabel: PartLabel;
    assignmentId?: string | null;
  },
): Promise<LoadedItem | null> {
  const { questionId, questionSetId, partLabel, assignmentId } = params;

  let payload: unknown = null;

  if (assignmentId) {
    let snapshotQuery = supabase
      .from("assignment_question_snapshots")
      .select("payload")
      .eq("assignment_id", assignmentId)
      .eq("question_id", questionId);
    snapshotQuery = questionSetId
      ? snapshotQuery.eq("payload->>questionSetId", questionSetId)
      : snapshotQuery.is("payload->>questionSetId", null);
    const { data, error } = await snapshotQuery.maybeSingle();
    if (error) {
      throw new ShortAnswerItemLoadError(error.message, error.code);
    }
    payload = data?.payload ?? null;

    if (!payload) {
      const { data: snapshots, error: snapshotsError } = await supabase
        .from("assignment_question_snapshots")
        .select("payload")
        .eq("assignment_id", assignmentId);
      if (snapshotsError) {
        throw new ShortAnswerItemLoadError(
          snapshotsError.message,
          snapshotsError.code,
        );
      }
      payload =
        (snapshots ?? []).find((row) =>
          matchesSnapshotIdentity(row.payload, questionId, questionSetId),
        )
          ?.payload ?? null;
    }
  } else {
    // generated_questions is keyed by (set_id, id). Using only id forces the
    // hosted database to evaluate the table's nested student-access RLS policy
    // across the whole question bank, which can exceed the statement timeout.
    // The complete key is also required for correctness because id alone is
    // not unique by schema.
    if (!questionSetId) return null;
    const { data, error } = await supabase
      .from("generated_questions")
      .select("payload_lean")
      .eq("set_id", questionSetId)
      .eq("id", questionId)
      .maybeSingle();
    if (error) {
      throw new ShortAnswerItemLoadError(error.message, error.code);
    }
    payload = data?.payload_lean ?? null;
  }

  const item = extractShortAnswer(payload);
  if (!item) return null;

  const part = item.parts.find((p) => p.label === partLabel);
  if (!part) return null;

  return { item, part };
}
