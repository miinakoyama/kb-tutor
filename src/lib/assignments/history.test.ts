import { describe, expect, it } from "vitest";
import sampleShortAnswerItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";
import {
  buildHistoryAnswerForQuestion,
  buildLatestMcqAttemptsByQuestion,
  buildShortAnswerAttemptsByQuestion,
  buildShortAnswerHistoryAnswer,
  isHistoryAnswerCorrect,
  summarizeHistoryItems,
} from "./history";

const shortAnswer = sampleShortAnswerItem as ShortAnswerItem;

describe("assignment history helpers", () => {
  it("groups MCQ attempts to the latest row per question within a window", () => {
    const latest = buildLatestMcqAttemptsByQuestion(
      [
        {
          question_id: "q1",
          selected_option_id: "a",
          is_correct: false,
          answered_at: "2026-07-08T10:00:00.000Z",
        },
        {
          question_id: "q1",
          selected_option_id: "b",
          is_correct: true,
          answered_at: "2026-07-08T10:05:00.000Z",
        },
      ],
      null,
      "2026-07-08T11:00:00.000Z",
    );
    expect(latest.get("q1")).toEqual({
      selectedOptionId: "b",
      isCorrect: true,
    });
  });

  it("builds short-answer history answers per part with attempts", () => {
    const attempts = buildShortAnswerAttemptsByQuestion(
      [
        {
          question_id: "sa1",
          part_label: "A",
          attempt_number: 1,
          response_text: "DNA",
          is_correct: true,
          feedback: { verdict: "correct", segments: [{ label: "", text: "Nice." }] },
          answered_at: "2026-07-08T10:00:00.000Z",
        },
        {
          question_id: "sa1",
          part_label: "B",
          attempt_number: 1,
          response_text: "Not quite",
          is_correct: false,
          feedback: { verdict: "incorrect", segments: [{ label: "", text: "Try again." }] },
          answered_at: "2026-07-08T10:02:00.000Z",
        },
      ],
      null,
      "2026-07-08T11:00:00.000Z",
    );

    const answer = buildShortAnswerHistoryAnswer(shortAnswer, attempts.get("sa1") ?? []);
    expect(answer.kind).toBe("short-answer");
    expect(answer.parts[0]?.attempts[0]?.responseText).toBe("DNA");
    expect(answer.parts[0]?.isCorrect).toBe(true);
    expect(answer.isCorrect).toBe(false);
  });

  it("summarizes mixed history items", () => {
    const summary = summarizeHistoryItems([
      {
        question: { id: "mcq1" } as never,
        answer: { kind: "mcq", selectedOptionId: "a", isCorrect: true },
      },
      {
        question: {
          id: "sa1",
          shortAnswer,
          questionType: "open-ended",
        } as never,
        answer: buildHistoryAnswerForQuestion(
          { id: "sa1", shortAnswer, questionType: "open-ended" } as never,
          undefined,
          [
            {
              partLabel: "A",
              attemptNumber: 1,
              responseText: "DNA",
              isCorrect: true,
              feedback: { verdict: "correct", segments: [] },
              answeredAt: "2026-07-08T10:00:00.000Z",
            },
          ],
        ),
      },
    ]);
    expect(summary.total).toBe(2);
    expect(summary.answered).toBe(1);
    expect(summary.correct).toBe(1);
    expect(
      isHistoryAnswerCorrect(
        buildHistoryAnswerForQuestion(
          { id: "sa1", shortAnswer, questionType: "open-ended" } as never,
          undefined,
          [
            {
              partLabel: "A",
              attemptNumber: 1,
              responseText: "DNA",
              isCorrect: true,
              feedback: { verdict: "correct", segments: [] },
              answeredAt: "2026-07-08T10:00:00.000Z",
            },
          ],
        ),
      ),
    ).toBe(false);
  });
});
