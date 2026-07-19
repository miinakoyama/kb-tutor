import { describe, expect, it } from "vitest";
import type { Question } from "@/types/question";
import type { ShortAnswerItem } from "@/types/short-answer";
import sampleShortAnswerItem from "@/data/short-answer/sample-item.json";
import {
  MCQ_PACE_WEIGHT,
  PRACTICE_PACE_THRESHOLD,
  SAQ_PACE_WEIGHT,
  computeSessionPaceCount,
  paceWeightForQuestion,
  practicePaceMilestone,
  shouldOfferPracticePaceCheckIn,
} from "./session-pace";

const mcq = (id: string): Question => ({
  id,
  module: 1,
  topic: "Genetics",
  text: "Which option is correct?",
  imageUrl: null,
  options: [
    { id: "A", text: "Option A" },
    { id: "B", text: "Option B" },
  ],
  correctOptionId: "B",
  source: "manual",
});

const saq = (id: string): Question => ({
  ...mcq(id),
  questionType: "open-ended",
  options: [],
  correctOptionId: "",
  shortAnswer: sampleShortAnswerItem as ShortAnswerItem,
});

describe("session-pace", () => {
  it("weights MCQ as 1 and SAQ as 2", () => {
    expect(paceWeightForQuestion(mcq("m"))).toBe(MCQ_PACE_WEIGHT);
    expect(paceWeightForQuestion(saq("s"))).toBe(SAQ_PACE_WEIGHT);
    expect(PRACTICE_PACE_THRESHOLD).toBe(10);
  });

  it("sums pace counts across mixed completed questions", () => {
    const questions = [mcq("1"), saq("2"), mcq("3"), saq("4")];
    // 1 + 2 + 1 + 2 = 6
    expect(computeSessionPaceCount(questions, [0, 1, 2, 3])).toBe(6);
    expect(computeSessionPaceCount(questions, [1, 3])).toBe(4);
  });

  it("ignores invalid or missing indices", () => {
    const questions = [mcq("1")];
    expect(computeSessionPaceCount(questions, [-1, 0, 4, Number.NaN])).toBe(1);
  });

  it("computes pace milestones every threshold units", () => {
    expect(practicePaceMilestone(9)).toBe(0);
    expect(practicePaceMilestone(10)).toBe(10);
    expect(practicePaceMilestone(19)).toBe(10);
    expect(practicePaceMilestone(20)).toBe(20);
  });

  it("offers a check-in at each new milestone", () => {
    expect(
      shouldOfferPracticePaceCheckIn({
        enabled: true,
        lastOfferedMilestone: 0,
        paceCount: 10,
      }),
    ).toBe(true);
    expect(
      shouldOfferPracticePaceCheckIn({
        enabled: true,
        lastOfferedMilestone: 10,
        paceCount: 15,
      }),
    ).toBe(false);
    expect(
      shouldOfferPracticePaceCheckIn({
        enabled: true,
        lastOfferedMilestone: 10,
        paceCount: 20,
      }),
    ).toBe(true);
    expect(
      shouldOfferPracticePaceCheckIn({
        enabled: false,
        lastOfferedMilestone: 0,
        paceCount: 20,
      }),
    ).toBe(false);
  });

  it("reaches the threshold after five SAQs or ten MCQs", () => {
    const fiveSaq = Array.from({ length: 5 }, (_, i) => saq(`s-${i}`));
    expect(computeSessionPaceCount(fiveSaq, [0, 1, 2, 3, 4])).toBe(10);

    const tenMcq = Array.from({ length: 10 }, (_, i) => mcq(`m-${i}`));
    expect(
      computeSessionPaceCount(
        tenMcq,
        tenMcq.map((_, i) => i),
      ),
    ).toBe(10);
  });
});
