import { describe, expect, it } from "vitest";
import sampleItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";
import type { Question } from "@/types/question";
import {
  evaluateShortAnswerQuestionCompletion,
  mergeShortAnswerIntoAnsweredMap,
} from "./question-completion";

const item = sampleItem as ShortAnswerItem;

const saqQuestion: Question = {
  id: "sa-sample-0001",
  questionType: "open-ended",
  shortAnswer: item,
} as Question;

describe("evaluateShortAnswerQuestionCompletion", () => {
  it("does not mark a question complete when only one part is resolved", () => {
    const result = evaluateShortAnswerQuestionCompletion(item.parts, [
      {
        id: "a1",
        question_id: saqQuestion.id,
        part_label: "A",
        attempt_number: 1,
        response_text: "answer",
        feedback: { verdict: "correct", segments: [] },
        is_correct: true,
        answered_at: "2026-07-08T10:00:00.000Z",
      },
    ]);
    expect(result.allResolved).toBe(false);
    expect(result.allCorrect).toBe(false);
  });

  it("marks a question complete when every part is resolved", () => {
    const result = evaluateShortAnswerQuestionCompletion(item.parts, [
      {
        id: "a1",
        question_id: saqQuestion.id,
        part_label: "A",
        attempt_number: 1,
        response_text: "answer a",
        feedback: { verdict: "correct", segments: [] },
        is_correct: true,
        answered_at: "2026-07-08T10:00:00.000Z",
      },
      {
        id: "b1",
        question_id: saqQuestion.id,
        part_label: "B",
        attempt_number: 1,
        response_text: "answer b",
        feedback: { verdict: "incorrect", segments: [] },
        is_correct: false,
        answered_at: "2026-07-08T10:05:00.000Z",
      },
      {
        id: "b2",
        question_id: saqQuestion.id,
        part_label: "B",
        attempt_number: 2,
        response_text: "answer b retry",
        feedback: { verdict: "correct", segments: [] },
        is_correct: true,
        answered_at: "2026-07-08T10:06:00.000Z",
      },
      {
        id: "c1",
        question_id: saqQuestion.id,
        part_label: "C",
        attempt_number: 1,
        response_text: "answer c",
        feedback: { verdict: "correct", segments: [] },
        is_correct: true,
        answered_at: "2026-07-08T10:10:00.000Z",
      },
    ]);
    expect(result.allResolved).toBe(true);
    expect(result.allCorrect).toBe(true);
    expect(result.latestAnsweredAt).toBe("2026-07-08T10:10:00.000Z");
  });
});

describe("mergeShortAnswerIntoAnsweredMap", () => {
  it("drops legacy short-answer entries until every part is resolved", () => {
    const merged = mergeShortAnswerIntoAnsweredMap(
      {
        [saqQuestion.id]: {
          selectedOptionId: "short-answer",
          isCorrect: true,
          answeredAt: "2026-07-08T10:00:00.000Z",
        },
      },
      [saqQuestion],
      [
        {
          id: "a1",
          question_id: saqQuestion.id,
          part_label: "A",
          attempt_number: 1,
          response_text: "answer",
          feedback: { verdict: "correct", segments: [] },
          is_correct: true,
          answered_at: "2026-07-08T10:00:00.000Z",
        },
      ],
      { lastCompletedAt: null },
    );
    expect(merged[saqQuestion.id]).toBeUndefined();
  });
});
