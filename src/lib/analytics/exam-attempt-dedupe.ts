type DedupeCandidateRow = {
  user_id: string;
  question_id: string;
  question_set_id?: string | null;
  mode: string | null;
  assignment_id: string | null;
  answered_at: string;
};

function toEpochMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function compareByAnsweredAtDesc(
  a: Pick<DedupeCandidateRow, "answered_at">,
  b: Pick<DedupeCandidateRow, "answered_at">,
): number {
  const aMs = toEpochMs(a.answered_at);
  const bMs = toEpochMs(b.answered_at);
  if (aMs === bMs) return 0;
  return aMs < bMs ? 1 : -1;
}

/**
 * Assignment exam flows persist progress on each selection change to support
 * resume/recovery. For reporting, we normalize those rows to one final attempt
 * per (user, assignment, question): the latest `answered_at` wins.
 */
export function dedupeAssignmentExamAttempts<T extends DedupeCandidateRow>(
  rows: readonly T[],
): T[] {
  const latestExamRowByKey = new Map<
    string,
    { row: T; answeredAtMs: number; sourceIndex: number }
  >();
  const passthroughRows: T[] = [];

  rows.forEach((row, index) => {
    const isAssignmentExam =
      row.mode === "exam" &&
      typeof row.assignment_id === "string" &&
      row.assignment_id.length > 0;
    if (!isAssignmentExam) {
      passthroughRows.push(row);
      return;
    }

    const key = JSON.stringify([
      row.user_id,
      row.assignment_id,
      row.question_set_id ?? null,
      row.question_id,
    ]);
    const answeredAtMs = toEpochMs(row.answered_at);
    const existing = latestExamRowByKey.get(key);
    if (
      !existing ||
      answeredAtMs > existing.answeredAtMs ||
      (answeredAtMs === existing.answeredAtMs && index > existing.sourceIndex)
    ) {
      latestExamRowByKey.set(key, { row, answeredAtMs, sourceIndex: index });
    }
  });

  const dedupedExamRows = Array.from(latestExamRowByKey.values()).map(
    (entry) => entry.row,
  );

  return [...passthroughRows, ...dedupedExamRows].sort(compareByAnsweredAtDesc);
}
