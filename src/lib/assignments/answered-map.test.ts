import { describe, expect, it } from "vitest";
import {
  buildAnsweredMap,
  collectQuestionIds,
  countAnsweredQuestions,
  type AttemptRow,
} from "./answered-map";
import type { Question } from "@/types/question";

function row(overrides: Partial<AttemptRow>): AttemptRow {
  return {
    question_id: "q1",
    selected_option_id: "a",
    is_correct: true,
    answered_at: "2026-04-19T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildAnsweredMap", () => {
  it("returns an empty map when there are no attempts", () => {
    expect(buildAnsweredMap([], { lastCompletedAt: null })).toEqual({});
  });

  it("includes every attempt when no completion has occurred", () => {
    const map = buildAnsweredMap(
      [
        row({ question_id: "q1", selected_option_id: "a", is_correct: true }),
        row({
          question_id: "q2",
          selected_option_id: "b",
          is_correct: false,
          answered_at: "2026-04-19T10:05:00.000Z",
        }),
      ],
      { lastCompletedAt: null },
    );
    expect(Object.keys(map).sort()).toEqual(["q1", "q2"]);
    expect(map.q1.isCorrect).toBe(true);
    expect(map.q2.isCorrect).toBe(false);
  });

  it("filters out attempts on or before last_completed_at", () => {
    const map = buildAnsweredMap(
      [
        row({
          question_id: "q1",
          answered_at: "2026-04-19T09:00:00.000Z", // before
        }),
        row({
          question_id: "q2",
          answered_at: "2026-04-19T10:00:00.000Z", // equal -> excluded
        }),
        row({
          question_id: "q3",
          answered_at: "2026-04-19T11:00:00.000Z", // after -> kept
        }),
      ],
      { lastCompletedAt: "2026-04-19T10:00:00.000Z" },
    );
    expect(Object.keys(map)).toEqual(["q3"]);
  });

  it("keeps the latest attempt when a question is answered multiple times", () => {
    const map = buildAnsweredMap(
      [
        row({
          question_id: "q1",
          selected_option_id: "a",
          is_correct: false,
          answered_at: "2026-04-19T10:00:00.000Z",
        }),
        row({
          question_id: "q1",
          selected_option_id: "b",
          is_correct: true,
          answered_at: "2026-04-19T10:05:00.000Z",
        }),
      ],
      { lastCompletedAt: null },
    );
    expect(map.q1.selectedOptionId).toBe("b");
    expect(map.q1.isCorrect).toBe(true);
  });

  it("skips rows with invalid question_id or answered_at", () => {
    const map = buildAnsweredMap(
      [
        row({ question_id: "", answered_at: "2026-04-19T10:00:00.000Z" }),
        row({ question_id: "q1", answered_at: null as unknown as string }),
        row({ question_id: 123 as unknown as string }),
      ],
      { lastCompletedAt: null },
    );
    expect(map).toEqual({});
  });

  it("coerces non-string selected_option_id to null", () => {
    const map = buildAnsweredMap(
      [row({ selected_option_id: null, is_correct: false })],
      { lastCompletedAt: null },
    );
    expect(map.q1.selectedOptionId).toBeNull();
    expect(map.q1.isCorrect).toBe(false);
  });

  it("ignores attempts with unparseable answered_at when last_completed_at is set", () => {
    const map = buildAnsweredMap(
      [row({ question_id: "q1", answered_at: "not-a-date" })],
      { lastCompletedAt: "2026-04-19T10:00:00.000Z" },
    );
    expect(map).toEqual({});
  });
});

describe("countAnsweredQuestions", () => {
  it("returns the number of unique answered question ids", () => {
    const count = countAnsweredQuestions(
      [
        row({ question_id: "q1" }),
        row({ question_id: "q1", answered_at: "2026-04-19T10:05:00.000Z" }),
        row({ question_id: "q2", answered_at: "2026-04-19T10:10:00.000Z" }),
      ],
      { lastCompletedAt: null },
    );
    expect(count).toBe(2);
  });
});

describe("collectQuestionIds", () => {
  it("returns only non-empty string ids", () => {
    const qs: Question[] = [
      { id: "q1" } as Question,
      { id: "" } as Question,
      { id: undefined as unknown as string } as Question,
      { id: "q2" } as Question,
    ];
    expect(collectQuestionIds(qs)).toEqual(["q1", "q2"]);
  });
});
