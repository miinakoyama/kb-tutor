/**
 * Server-side resolution of a short-answer item + part for grading.
 * Reads the payload from the assignment snapshot when an assignmentId is
 * supplied. Review assignments have no frozen snapshots, so those fall back
 * to generated_questions (same as Self Practice). Uses the caller's session
 * client so RLS still scopes access when reading the live bank. Returns null
 * when the question is not a valid short-answer item (route responds 404),
 * and throws when the database lookup itself fails so callers do not
 * misreport an outage as missing data.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PartLabel, ShortAnswerItem, ShortAnswerPart } from "@/types/short-answer";
import {
  resolveRuntimeShortAnswerItem,
  type RuntimeShortAnswerResolution,
} from "@/lib/short-answer/question-guards";
import { isQuestionInReviewAssignmentScope } from "@/lib/student-assignments";

interface StoredPayload {
  id?: string;
  questionType?: string;
  shortAnswer?: unknown;
}

function extractShortAnswer(payload: unknown): RuntimeShortAnswerResolution {
  if (!payload || typeof payload !== "object") {
    return {
      item: null,
      error: "stored question payload must be an object",
      repairedLegacyKeyTerms: false,
    };
  }
  const record = payload as StoredPayload;
  const direct = resolveRuntimeShortAnswerItem(payload);
  if (direct.item) return direct;
  if (record.questionType !== "open-ended") {
    return {
      item: null,
      error: "stored question is not marked open-ended",
      repairedLegacyKeyTerms: false,
    };
  }
  return resolveRuntimeShortAnswerItem(record.shortAnswer);
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

async function loadGeneratedQuestionPayload(
  supabase: SupabaseClient,
  params: {
    questionId: string;
    questionSetId?: string | null;
  },
): Promise<unknown> {
  const { questionId, questionSetId } = params;
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
  return data?.payload_lean ?? null;
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
    /** Required for review-assignment live-bank fallback scope checks. */
    studentUserId?: string | null;
  },
): Promise<LoadedItem | null> {
  const {
    questionId,
    questionSetId,
    partLabel,
    assignmentId,
    studentUserId,
  } = params;

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

    // Review assignments resolve questions from the live bank and do not
    // create assignment_question_snapshots rows. Only load questions that are
    // in this student's resolved review set for the assignment.
    if (!payload) {
      const { data: assignment, error: assignmentError } = await supabase
        .from("assignments")
        .select("mode")
        .eq("id", assignmentId)
        .maybeSingle();
      if (assignmentError) {
        throw new ShortAnswerItemLoadError(
          assignmentError.message,
          assignmentError.code,
        );
      }
      if (assignment?.mode !== "review") return null;
      if (!studentUserId) return null;
      const scope = await isQuestionInReviewAssignmentScope(
        supabase,
        studentUserId,
        assignmentId,
        questionId,
        questionSetId,
      );
      if (scope.error) {
        throw new ShortAnswerItemLoadError(scope.error);
      }
      if (!scope.allowed) return null;
      payload = await loadGeneratedQuestionPayload(supabase, {
        questionId,
        questionSetId,
      });
    }
  } else {
    payload = await loadGeneratedQuestionPayload(supabase, {
      questionId,
      questionSetId,
    });
  }

  const resolved = extractShortAnswer(payload);
  if (!resolved.item) {
    console.error("[short-answer/load-item] invalid stored item", {
      questionId,
      questionSetId,
      assignmentId,
      validationError: resolved.error,
    });
    return null;
  }
  const item = resolved.item;

  const part = item.parts.find((p) => p.label === partLabel);
  if (!part) return null;

  return { item, part };
}
