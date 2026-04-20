export interface AttemptOutcome {
  questionId: string;
  isCorrect: boolean;
}

export type WrongCountMap = Map<string, number>;

export function buildWrongCountMap(attempts: AttemptOutcome[]): WrongCountMap {
  const wrongCountByQuestion: WrongCountMap = new Map<string, number>();
  for (const attempt of attempts) {
    if (attempt.isCorrect) continue;
    const current = wrongCountByQuestion.get(attempt.questionId) ?? 0;
    wrongCountByQuestion.set(attempt.questionId, current + 1);
  }
  return wrongCountByQuestion;
}

export function prioritizeQuestionsByWrongCount<T extends { id: string }>(
  questions: T[],
  wrongCountById: WrongCountMap,
  options?: {
    shuffleWithinSameWrongCount?: (bucket: T[], wrongCount: number) => T[];
  },
): T[] {
  const byWrongCount = new Map<number, T[]>();
  for (const question of questions) {
    const wrongCount = wrongCountById.get(question.id) ?? 0;
    const bucket = byWrongCount.get(wrongCount) ?? [];
    bucket.push(question);
    byWrongCount.set(wrongCount, bucket);
  }

  const sortedWrongCounts = Array.from(byWrongCount.keys()).sort((a, b) => b - a);
  const prioritized: T[] = [];
  for (const wrongCount of sortedWrongCounts) {
    const bucket = byWrongCount.get(wrongCount) ?? [];
    const shuffled = options?.shuffleWithinSameWrongCount
      ? options.shuffleWithinSameWrongCount(bucket, wrongCount)
      : bucket;
    prioritized.push(...shuffled);
  }
  return prioritized;
}
