import { describe, expect, it } from "vitest";
import { buildStudentQuestionAggregates } from "./route";

const BASE_ATTEMPT = {
  user_id: "student-1",
  question_id: "shared-question",
  standard_id: "BIO.A.1",
  standard_label: "Biology standard",
  mode: "practice",
  assignment_id: null,
};

describe("buildStudentQuestionAggregates", () => {
  it("keeps reused question ids distinct by generated set and legacy identity", () => {
    const aggregates = buildStudentQuestionAggregates([
      {
        ...BASE_ATTEMPT,
        question_set_id: "set-a",
        is_correct: true,
        time_spent_sec: 20,
        answered_at: "2026-07-16T10:00:00.000Z",
      },
      {
        ...BASE_ATTEMPT,
        question_set_id: "set-a",
        is_correct: false,
        time_spent_sec: 40,
        answered_at: "2026-07-16T11:00:00.000Z",
      },
      {
        ...BASE_ATTEMPT,
        question_set_id: "set-b",
        is_correct: true,
        time_spent_sec: 15,
        answered_at: "2026-07-16T12:00:00.000Z",
      },
      {
        ...BASE_ATTEMPT,
        question_set_id: null,
        is_correct: false,
        time_spent_sec: null,
        answered_at: "2026-07-16T13:00:00.000Z",
      },
    ]);

    expect(aggregates).toHaveLength(3);
    expect(
      Array.from(aggregates.values()).map((aggregate) => ({
        setId: aggregate.questionSetId,
        attempted: aggregate.attempted,
        correct: aggregate.correct,
        averageTime:
          aggregate.timeCount > 0
            ? aggregate.timeTotal / aggregate.timeCount
            : null,
      })),
    ).toEqual([
      { setId: "set-a", attempted: 2, correct: 1, averageTime: 30 },
      { setId: "set-b", attempted: 1, correct: 1, averageTime: 15 },
      { setId: null, attempted: 1, correct: 0, averageTime: null },
    ]);
  });
});
