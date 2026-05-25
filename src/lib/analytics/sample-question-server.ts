import type {
  QuestionPreview,
  SampleMode,
  SampleQuestionPayload,
} from "@/lib/analytics/teacher-analytics-types";

export interface SampleQuestionStats {
  attempted: number;
  accuracy: number;
}

export interface SelectSampleQuestionInput {
  bankQuestionIds: readonly string[];
  previews: Map<string, QuestionPreview | null>;
  inScopeStats: Map<string, SampleQuestionStats>;
  mode: SampleMode;
  seed: string;
  skip: number;
  standardId: string;
  standardLabel: string;
}

/**
 * Deterministically pseudo-random integer generator.
 *
 * mulberry32 seeded by hashing the caller-supplied `seed` string into a
 * 32-bit integer. Same (seed, position) always returns the same value
 * so "Show another" can advance through the random ordering without
 * server-side state.
 */
function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], seed: string): T[] {
  const arr = [...items];
  const rng = mulberry32(hashSeed(seed));
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function compareByAccuracy(
  a: { id: string; stats: SampleQuestionStats | undefined },
  b: { id: string; stats: SampleQuestionStats | undefined },
  direction: "asc" | "desc",
): number {
  const aAttempted = a.stats?.attempted ?? 0;
  const bAttempted = b.stats?.attempted ?? 0;
  const aHas = aAttempted > 0;
  const bHas = bAttempted > 0;
  // Unattempted appended at the end.
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (!aHas && !bHas) return a.id.localeCompare(b.id);

  const aAcc = a.stats?.accuracy ?? 0;
  const bAcc = b.stats?.accuracy ?? 0;
  if (aAcc !== bAcc) {
    return direction === "asc" ? aAcc - bAcc : bAcc - aAcc;
  }
  // Tie-break: more attempts first (more trustworthy ordering).
  if (aAttempted !== bAttempted) return bAttempted - aAttempted;
  return a.id.localeCompare(b.id);
}

/**
 * Select the question at position `skip` in the current mode's
 * ordering of the bank for the given standard.
 *
 * - `random`: deterministic shuffle keyed by `seed`.
 * - `high_accuracy_first`: sorted by accuracy DESC (with the tie-break
 *   chain from the contract). Unattempted bank questions appended at
 *   the end (FR-046) in `questionId ASC` order.
 * - `low_accuracy_first`: same but ASC.
 *
 * When `skip >= totalAvailable` or the bank is empty, the function
 * returns a payload with `questionId: null` and `isLast: true` so the
 * modal can render the empty / exhausted state.
 */
export function selectSampleQuestion(
  input: SelectSampleQuestionInput,
): SampleQuestionPayload {
  const total = input.bankQuestionIds.length;
  const baseEmpty: Omit<SampleQuestionPayload, "questionId" | "preview" | "isLast" | "position"> = {
    standardId: input.standardId,
    standardLabel: input.standardLabel,
    totalAvailable: total,
    mode: input.mode,
    seed: input.seed,
  };

  if (total === 0) {
    return {
      questionId: null,
      preview: null,
      position: 0,
      isLast: true,
      ...baseEmpty,
    };
  }

  let ordered: string[];
  if (input.mode === "random") {
    ordered = shuffle(input.bankQuestionIds, input.seed);
  } else {
    const direction: "asc" | "desc" =
      input.mode === "low_accuracy_first" ? "asc" : "desc";
    const decorated = input.bankQuestionIds.map((id) => ({
      id,
      stats: input.inScopeStats.get(id),
    }));
    decorated.sort((a, b) => compareByAccuracy(a, b, direction));
    ordered = decorated.map((entry) => entry.id);
  }

  if (input.skip >= ordered.length) {
    return {
      questionId: null,
      preview: null,
      position: input.skip,
      isLast: true,
      ...baseEmpty,
    };
  }
  const questionId = ordered[input.skip];
  const preview = input.previews.get(questionId) ?? null;

  return {
    questionId,
    preview,
    position: input.skip,
    isLast: input.skip + 1 >= ordered.length,
    ...baseEmpty,
  };
}
