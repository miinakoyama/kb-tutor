import { describe, expect, it } from "vitest";
import {
  buildStandardDrillDown,
  type DrillDownAttemptRow,
} from "./standard-drill-down-server";
import type { QuestionPreview } from "@/lib/analytics/teacher-analytics-types";

function row(overrides: Partial<DrillDownAttemptRow>): DrillDownAttemptRow {
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

function preview(
  id: string,
  options: { id: string; text: string }[],
  correctOptionId: string,
): QuestionPreview {
  return {
    text: `Stem for ${id}`,
    imageUrl: null,
    diagram: null,
    options,
    correctOptionId,
  };
}

const standardLabel = "test";

describe("buildStandardDrillDown", () => {
  it("returns empty payload when no attempts", () => {
    const result = buildStandardDrillDown({
      attempts: [],
      previews: new Map(),
      standardId: "S1",
      standardLabel,
    });
    expect(result.questions).toEqual([]);
    expect(result.summary).toEqual({
      totalAttempts: 0,
      totalCorrect: 0,
      accuracy: 0,
      uniqueStudents: 0,
      questionsAttempted: 0,
    });
  });

  it("groups by question_id and computes per-row stats", () => {
    const attempts: DrillDownAttemptRow[] = [
      row({ user_id: "u1", question_id: "q1", is_correct: true, selected_option_id: "b" }),
      row({ user_id: "u2", question_id: "q1", is_correct: false, selected_option_id: "a" }),
      row({ user_id: "u3", question_id: "q1", is_correct: true, selected_option_id: "b" }),
      row({ user_id: "u1", question_id: "q2", is_correct: false, selected_option_id: "x" }),
    ];
    const previews = new Map([
      [
        "q1",
        preview(
          "q1",
          [
            { id: "a", text: "A" },
            { id: "b", text: "B" },
          ],
          "b",
        ),
      ],
      [
        "q2",
        preview(
          "q2",
          [
            { id: "x", text: "X" },
            { id: "y", text: "Y" },
          ],
          "y",
        ),
      ],
    ]);
    const result = buildStandardDrillDown({
      attempts,
      previews,
      standardId: "S1",
      standardLabel,
    });
    expect(result.summary.totalAttempts).toBe(4);
    expect(result.summary.totalCorrect).toBe(2);
    expect(result.summary.uniqueStudents).toBe(3);
    expect(result.summary.questionsAttempted).toBe(2);

    // q2 is 0%, q1 is 2/3 (~0.667) → q2 first (lower accuracy first).
    expect(result.questions.map((q) => q.questionId)).toEqual(["q2", "q1"]);

    const q1 = result.questions.find((q) => q.questionId === "q1");
    expect(q1).toBeDefined();
    expect(q1?.attempted).toBe(3);
    expect(q1?.correct).toBe(2);
    expect(q1?.uniqueStudents).toBe(3);
    expect(q1?.bucket).toBe("mid"); // 66.7% is between 55 and 70.
    const shareSum = (q1?.optionDistribution ?? []).reduce(
      (sum, o) => sum + o.share,
      0,
    );
    expect(Math.abs(shareSum - 1)).toBeLessThan(1e-9);
  });

  it("sorts by accuracy ASC, then attempted DESC, then questionId ASC", () => {
    const attempts: DrillDownAttemptRow[] = [
      // q_high: 2/2 = 1.0
      row({ user_id: "u1", question_id: "q_high", is_correct: true }),
      row({ user_id: "u2", question_id: "q_high", is_correct: true }),
      // q_tie_a: 1/2 = 0.5, attempted 2
      row({ user_id: "u1", question_id: "q_tie_a", is_correct: true }),
      row({ user_id: "u2", question_id: "q_tie_a", is_correct: false }),
      // q_tie_b: 2/4 = 0.5, attempted 4 → wins the tie because more attempts
      row({ user_id: "u3", question_id: "q_tie_b", is_correct: true }),
      row({ user_id: "u4", question_id: "q_tie_b", is_correct: true }),
      row({ user_id: "u5", question_id: "q_tie_b", is_correct: false }),
      row({ user_id: "u6", question_id: "q_tie_b", is_correct: false }),
      // q_low: 0/1 = 0
      row({ user_id: "u1", question_id: "q_low", is_correct: false }),
    ];
    const result = buildStandardDrillDown({
      attempts,
      previews: new Map(),
      standardId: "S1",
      standardLabel,
    });
    expect(result.questions.map((q) => q.questionId)).toEqual([
      "q_low",
      "q_tie_b",
      "q_tie_a",
      "q_high",
    ]);
  });

  it("color bucket boundaries use STANDARD_* constants (70 / 55)", () => {
    const attempts: DrillDownAttemptRow[] = [
      // q_70: 7/10 → high (>= 70)
      ...Array.from({ length: 7 }, (_, i) =>
        row({
          user_id: `u${i}`,
          question_id: "q_70",
          is_correct: true,
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        row({
          user_id: `u${i + 7}`,
          question_id: "q_70",
          is_correct: false,
        }),
      ),
      // q_55: 11/20 = 55% → mid (>= 55, < 70)
      ...Array.from({ length: 11 }, (_, i) =>
        row({ user_id: `v${i}`, question_id: "q_55", is_correct: true }),
      ),
      ...Array.from({ length: 9 }, (_, i) =>
        row({
          user_id: `v${i + 11}`,
          question_id: "q_55",
          is_correct: false,
        }),
      ),
      // q_lo: 2/10 = 20% → low (< 55)
      ...Array.from({ length: 2 }, (_, i) =>
        row({ user_id: `w${i}`, question_id: "q_lo", is_correct: true }),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        row({
          user_id: `w${i + 2}`,
          question_id: "q_lo",
          is_correct: false,
        }),
      ),
    ];
    const result = buildStandardDrillDown({
      attempts,
      previews: new Map(),
      standardId: "S1",
      standardLabel,
    });
    const buckets = Object.fromEntries(
      result.questions.map((q) => [q.questionId, q.bucket]),
    );
    expect(buckets).toEqual({
      q_70: "high",
      q_55: "mid",
      q_lo: "low",
    });
  });

  it("excludes time_spent_sec=null from averageTimeSec", () => {
    const attempts: DrillDownAttemptRow[] = [
      row({ question_id: "q1", time_spent_sec: 40, is_correct: true, user_id: "a" }),
      row({ question_id: "q1", time_spent_sec: null, is_correct: false, user_id: "b" }),
      row({ question_id: "q1", time_spent_sec: 60, is_correct: false, user_id: "c" }),
    ];
    const result = buildStandardDrillDown({
      attempts,
      previews: new Map(),
      standardId: "S1",
      standardLabel,
    });
    expect(result.questions[0]?.averageTimeSec).toBe(50);
  });

  it("returns 0 averageTimeSec when every row has null time", () => {
    const attempts: DrillDownAttemptRow[] = [
      row({ question_id: "q1", time_spent_sec: null, user_id: "a" }),
      row({ question_id: "q1", time_spent_sec: null, user_id: "b" }),
    ];
    const result = buildStandardDrillDown({
      attempts,
      previews: new Map(),
      standardId: "S1",
      standardLabel,
    });
    expect(result.questions[0]?.averageTimeSec).toBe(0);
  });

  it("dedupes assignment-exam attempts (same user+assignment+question → latest wins)", () => {
    const attempts: DrillDownAttemptRow[] = [
      row({
        user_id: "u1",
        question_id: "q1",
        mode: "exam",
        assignment_id: "asg_1",
        is_correct: false,
        answered_at: "2026-05-22T08:00:00Z",
      }),
      row({
        user_id: "u1",
        question_id: "q1",
        mode: "exam",
        assignment_id: "asg_1",
        is_correct: true,
        answered_at: "2026-05-22T08:05:00Z",
      }),
      row({
        user_id: "u2",
        question_id: "q1",
        mode: "practice",
        is_correct: false,
        answered_at: "2026-05-22T08:10:00Z",
      }),
      row({
        user_id: "u2",
        question_id: "q1",
        mode: "practice",
        is_correct: false,
        answered_at: "2026-05-22T08:11:00Z",
      }),
    ];
    const result = buildStandardDrillDown({
      attempts,
      previews: new Map(),
      standardId: "S1",
      standardLabel,
    });
    const q1 = result.questions[0];
    expect(q1?.attempted).toBe(3); // 1 deduped exam + 2 practice
    expect(q1?.correct).toBe(1);
    expect(q1?.byMode.exam.attempted).toBe(1);
    expect(q1?.byMode.exam.correct).toBe(1);
    expect(q1?.byMode.practice.attempted).toBe(2);
  });

  it("only returns questions with attempted >= 1 (empty attempts → empty rows)", () => {
    const result = buildStandardDrillDown({
      attempts: [],
      previews: new Map([
        [
          "q_unattempted",
          preview("q_unattempted", [{ id: "a", text: "A" }], "a"),
        ],
      ]),
      standardId: "S1",
      standardLabel,
    });
    expect(result.questions).toEqual([]);
  });

  it("option-distribution shares sum to 1.0", () => {
    const attempts: DrillDownAttemptRow[] = [
      row({ user_id: "u1", selected_option_id: "a" }),
      row({ user_id: "u2", selected_option_id: "a" }),
      row({ user_id: "u3", selected_option_id: "b", is_correct: true }),
      row({ user_id: "u4", selected_option_id: "b", is_correct: true }),
      row({ user_id: "u5", selected_option_id: "c" }),
    ];
    const previews = new Map([
      [
        "q1",
        preview(
          "q1",
          [
            { id: "a", text: "A" },
            { id: "b", text: "B" },
            { id: "c", text: "C" },
          ],
          "b",
        ),
      ],
    ]);
    const result = buildStandardDrillDown({
      attempts,
      previews,
      standardId: "S1",
      standardLabel,
    });
    const dist = result.questions[0]?.optionDistribution ?? [];
    const total = dist.reduce((sum, o) => sum + o.share, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
    expect(dist.find((o) => o.optionId === "a")?.picks).toBe(2);
    expect(dist.find((o) => o.optionId === "b")?.picks).toBe(2);
    expect(dist.find((o) => o.optionId === "c")?.picks).toBe(1);
  });

  it("per-mode breakdown sums match overall", () => {
    const attempts: DrillDownAttemptRow[] = [
      row({ user_id: "u1", question_id: "q1", mode: "practice", is_correct: true }),
      row({ user_id: "u2", question_id: "q1", mode: "exam", assignment_id: "a", is_correct: false }),
      row({ user_id: "u3", question_id: "q1", mode: "review", is_correct: false }),
    ];
    const result = buildStandardDrillDown({
      attempts,
      previews: new Map(),
      standardId: "S1",
      standardLabel,
    });
    const q = result.questions[0];
    expect(q).toBeDefined();
    const modeSum =
      (q?.byMode.practice.attempted ?? 0) +
      (q?.byMode.exam.attempted ?? 0) +
      (q?.byMode.review.attempted ?? 0);
    expect(modeSum).toBe(q?.attempted);
    const correctSum =
      (q?.byMode.practice.correct ?? 0) +
      (q?.byMode.exam.correct ?? 0) +
      (q?.byMode.review.correct ?? 0);
    expect(correctSum).toBe(q?.correct);
  });
});
