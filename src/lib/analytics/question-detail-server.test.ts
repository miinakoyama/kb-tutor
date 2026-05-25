import { describe, expect, it } from "vitest";
import {
  buildQuestionDetail,
  type QuestionDetailAttemptRow,
} from "./question-detail-server";
import { buildStandardDrillDown } from "./standard-drill-down-server";
import type { QuestionPreview } from "@/lib/analytics/teacher-analytics-types";

function row(
  overrides: Partial<QuestionDetailAttemptRow>,
): QuestionDetailAttemptRow {
  return {
    user_id: "u1",
    question_id: "q1",
    mode: "practice",
    assignment_id: null,
    selected_option_id: "a",
    is_correct: false,
    time_spent_sec: 30,
    answered_at: "2026-05-22T08:00:00Z",
    ...overrides,
  };
}

const PREVIEW: QuestionPreview = {
  text: "Q1 stem",
  imageUrl: null,
  diagram: null,
  options: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
    { id: "c", text: "C" },
  ],
  correctOptionId: "b",
};

describe("buildQuestionDetail", () => {
  it("returns zero summary and per-option zeros when no attempts in scope", () => {
    const payload = buildQuestionDetail({
      attempts: [],
      preview: PREVIEW,
      questionId: "q1",
      standardId: "S",
      standardLabel: "S",
      scope: "selected",
    });
    expect(payload.summary).toEqual({
      totalAttempts: 0,
      uniqueStudents: 0,
      correct: 0,
      accuracy: 0,
      averageTimeSec: 0,
      timeP50Sec: null,
      timeP90Sec: null,
    });
    expect(payload.optionDistribution).toHaveLength(3);
    payload.optionDistribution.forEach((option) => {
      expect(option.picks).toBe(0);
      expect(option.share).toBe(0);
    });
    expect(payload.byMode.practice.attempted).toBe(0);
    expect(payload.byMode.exam.attempted).toBe(0);
    expect(payload.byMode.review.attempted).toBe(0);
    expect(payload.studentContext).toBeUndefined();
  });

  it("computes summary, byMode, and time percentiles", () => {
    const attempts = [
      row({ user_id: "u1", is_correct: true, selected_option_id: "b", time_spent_sec: 20 }),
      row({ user_id: "u2", is_correct: false, selected_option_id: "a", time_spent_sec: 50 }),
      row({
        user_id: "u3",
        mode: "exam",
        assignment_id: "asg_1",
        is_correct: false,
        selected_option_id: "c",
        time_spent_sec: 70,
      }),
    ];
    const payload = buildQuestionDetail({
      attempts,
      preview: PREVIEW,
      questionId: "q1",
      standardId: "S",
      standardLabel: "S",
      scope: "selected",
    });
    expect(payload.summary.totalAttempts).toBe(3);
    expect(payload.summary.uniqueStudents).toBe(3);
    expect(payload.summary.correct).toBe(1);
    expect(payload.summary.accuracy).toBeCloseTo(1 / 3, 9);
    // Nearest-rank percentile of sorted [20, 50, 70]:
    //   p50 = idx floor(2 * 0.5) = 1 → 50
    //   p90 = idx floor(2 * 0.9) = 1 → 50  (only 3 samples)
    expect(payload.summary.timeP50Sec).toBe(50);
    expect(payload.summary.timeP90Sec).toBe(50);
    expect(payload.byMode.practice.attempted).toBe(2);
    expect(payload.byMode.exam.attempted).toBe(1);
    expect(payload.byMode.review.attempted).toBe(0);
    expect(payload.byMode.review.accuracy).toBe(0);
    const shareSum = payload.optionDistribution.reduce(
      (sum, o) => sum + o.share,
      0,
    );
    expect(Math.abs(shareSum - 1)).toBeLessThan(1e-9);
  });

  it("populates studentContext only when student has in-scope attempts", () => {
    const attempts = [
      row({
        user_id: "stu_target",
        is_correct: false,
        selected_option_id: "a",
        answered_at: "2026-05-22T08:00:00Z",
      }),
      row({
        user_id: "stu_target",
        is_correct: true,
        selected_option_id: "b",
        answered_at: "2026-05-22T08:05:00Z",
      }),
      row({
        user_id: "other",
        is_correct: false,
        selected_option_id: "c",
        answered_at: "2026-05-22T08:10:00Z",
      }),
    ];

    const withCtx = buildQuestionDetail({
      attempts,
      preview: PREVIEW,
      questionId: "q1",
      standardId: "S",
      standardLabel: "S",
      scope: "selected",
      studentContext: { studentId: "stu_target", label: "Alice" },
    });
    expect(withCtx.studentContext).toBeDefined();
    // Latest of stu_target's attempts wins (b, correct, 08:05).
    expect(withCtx.studentContext?.selectedOptionId).toBe("b");
    expect(withCtx.studentContext?.isCorrect).toBe(true);

    const noAttempts = buildQuestionDetail({
      attempts,
      preview: PREVIEW,
      questionId: "q1",
      standardId: "S",
      standardLabel: "S",
      scope: "selected",
      studentContext: { studentId: "stu_no_attempts", label: "Bob" },
    });
    expect(noAttempts.studentContext).toBeUndefined();
  });

  it("dedupes assignment-exam attempts", () => {
    const attempts = [
      row({
        user_id: "u1",
        mode: "exam",
        assignment_id: "asg_1",
        is_correct: false,
        selected_option_id: "a",
        answered_at: "2026-05-22T08:00:00Z",
      }),
      row({
        user_id: "u1",
        mode: "exam",
        assignment_id: "asg_1",
        is_correct: true,
        selected_option_id: "b",
        answered_at: "2026-05-22T08:05:00Z",
      }),
    ];
    const payload = buildQuestionDetail({
      attempts,
      preview: PREVIEW,
      questionId: "q1",
      standardId: "S",
      standardLabel: "S",
      scope: "selected",
    });
    expect(payload.summary.totalAttempts).toBe(1);
    expect(payload.summary.correct).toBe(1);
  });

  it("matches buildStandardDrillDown totals for the same scope (SC-003 invariant)", () => {
    const attempts = [
      row({ user_id: "a", is_correct: true, selected_option_id: "b" }),
      row({ user_id: "b", is_correct: false, selected_option_id: "a" }),
      row({ user_id: "c", is_correct: true, selected_option_id: "b" }),
      row({ user_id: "d", is_correct: false, selected_option_id: "c", mode: "exam", assignment_id: "asg_1" }),
    ];
    const previews = new Map([["q1", PREVIEW]]);
    const drill = buildStandardDrillDown({
      attempts,
      previews,
      standardId: "S",
      standardLabel: "S",
    });
    const detail = buildQuestionDetail({
      attempts,
      preview: PREVIEW,
      questionId: "q1",
      standardId: "S",
      standardLabel: "S",
      scope: "selected",
    });
    const q1Drill = drill.questions.find((q) => q.questionId === "q1")!;
    expect(detail.summary.totalAttempts).toBe(q1Drill.attempted);
    expect(detail.summary.correct).toBe(q1Drill.correct);
    expect(detail.summary.accuracy).toBeCloseTo(q1Drill.accuracy, 9);
    expect(detail.byMode.practice.attempted).toBe(
      q1Drill.byMode.practice.attempted,
    );
    expect(detail.byMode.exam.attempted).toBe(q1Drill.byMode.exam.attempted);
  });
});
