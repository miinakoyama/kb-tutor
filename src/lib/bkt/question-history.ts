const SCOPED_PREFIX = "set-question:";
const LEGACY_PREFIX = "question:";

export function questionHistoryKey(
  questionSetId: string | null,
  questionId: string,
): string {
  return questionSetId
    ? `${SCOPED_PREFIX}${questionSetId}\0${questionId}`
    : `${LEGACY_PREFIX}${questionId}`;
}

export function getQuestionHistory<T>(
  history: ReadonlyMap<string, T>,
  questionSetId: string,
  questionId: string,
): { found: boolean; value: T | undefined } {
  const scopedKey = questionHistoryKey(questionSetId, questionId);
  if (history.has(scopedKey)) {
    return { found: true, value: history.get(scopedKey) };
  }

  const legacyKey = questionHistoryKey(null, questionId);
  return {
    found: history.has(legacyKey),
    value: history.get(legacyKey),
  };
}
