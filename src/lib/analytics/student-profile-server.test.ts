import { describe, expect, it } from "vitest";
import {
  buildStudentProfile,
  type StudentProfileAttemptRow,
} from "./student-profile-server";
import type { QuestionPreview } from "@/lib/analytics/teacher-analytics-types";

function row(
  overrides: Partial<StudentProfileAttemptRow>,
): StudentProfileAttemptRow {
  return {
    id: "att1",
    user_id: "stu_1",
    question_id: "q1",
    mode: "practice",
    assignment_id: null,
    standard_id: "3.1.9-12.A",
    standard_label: "Standard A",
    selected_option_id: "a",
    is_correct: false,
    time_spent_sec: 30,
    answered_at: "2026-05-22T08:00:00Z",
    ...overrides,
  };
}

const STUDENT = {
  id: "stu_1",
  label: "Alice",
  classId: "sch_a",
  classLabel: "North High",
};

const previewMap = new Map<string, QuestionPreview | null>([
  [
    "q1",
    {
      text: "Q1 stem",
      imageUrl: null,
      diagram: null,
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
      correctOptionId: "b",
    },
  ],
]);

const assignmentLabels = new Map([
  ["asg_1", "Cell Structure Quiz"],
]);

describe("buildStudentProfile", () => {
  it("returns empty payload for zero attempts", () => {
    const payload = buildStudentProfile({
      attempts: [],
      student: STUDENT,
      previews: new Map(),
      assignmentLabels: new Map(),
      cursor: null,
    });
    expect(payload.chart).toEqual([]);
    expect(payload.answers.rows).toEqual([]);
    expect(payload.answers.nextCursor).toBeNull();
    expect(payload.summary.totalAttempts).toBe(0);
    expect(payload.summary.status).toBe("not_started");
    expect(payload.filters.assignments).toEqual([]);
    expect(payload.filters.standards).toEqual([]);
  });

  it("computes the chart's rolling and cumulative accuracies correctly", () => {
    // 25 alternating attempts: T, F, T, F, … (correct on odd indices 1, 3, 5, …)
    const attempts: StudentProfileAttemptRow[] = Array.from(
      { length: 25 },
      (_, i) => {
        const minute = i.toString().padStart(2, "0");
        return row({
          id: `att${i + 1}`,
          is_correct: i % 2 === 0,
          answered_at: `2026-05-22T08:${minute}:00Z`,
        });
      },
    );
    const payload = buildStudentProfile({
      attempts,
      student: STUDENT,
      previews: previewMap,
      assignmentLabels,
      cursor: null,
    });
    expect(payload.chart).toHaveLength(25);
    // First 9 points have isSmallSample true (cumulativeCount < 10).
    for (let i = 0; i < 9; i += 1) {
      expect(payload.chart[i].isSmallSample).toBe(true);
    }
    expect(payload.chart[9].isSmallSample).toBe(false);
    // Rolling accuracy at index 20 (1-based): window is full 20 attempts ending
    // at index 20. Of those 20: T F T F ... = 10 T and 10 F → 0.5.
    expect(payload.chart[19].rollingAccuracy).toBeCloseTo(0.5, 9);
    // Cumulative accuracy at index 25: 13 correct out of 25 = 0.52.
    expect(payload.chart[24].cumulativeAccuracy).toBeCloseTo(13 / 25, 9);
  });

  it("paginates the answer list with stable answered_at cursor", () => {
    const attempts: StudentProfileAttemptRow[] = Array.from(
      { length: 12 },
      (_, i) => {
        const minute = i.toString().padStart(2, "0");
        return row({
          id: `att${i + 1}`,
          answered_at: `2026-05-22T08:${minute}:00Z`,
          is_correct: false,
        });
      },
    );
    const firstPage = buildStudentProfile({
      attempts,
      student: STUDENT,
      previews: previewMap,
      assignmentLabels,
      cursor: null,
      pageSize: 5,
    });
    expect(firstPage.answers.rows).toHaveLength(5);
    expect(firstPage.answers.rows.map((r) => r.attemptId)).toEqual([
      "att12",
      "att11",
      "att10",
      "att9",
      "att8",
    ]);
    expect(firstPage.answers.nextCursor).toBe("2026-05-22T08:07:00Z");

    const secondPage = buildStudentProfile({
      attempts,
      student: STUDENT,
      previews: previewMap,
      assignmentLabels,
      cursor: firstPage.answers.nextCursor,
      pageSize: 5,
    });
    expect(secondPage.answers.rows.map((r) => r.attemptId)).toEqual([
      "att7",
      "att6",
      "att5",
      "att4",
      "att3",
    ]);
  });

  it("labels self-practice attempts and resolves assignment labels", () => {
    const attempts: StudentProfileAttemptRow[] = [
      row({ id: "att1", assignment_id: null, answered_at: "2026-05-22T08:00:00Z" }),
      row({ id: "att2", assignment_id: "asg_1", answered_at: "2026-05-22T08:01:00Z" }),
      row({ id: "att3", assignment_id: "asg_unknown", answered_at: "2026-05-22T08:02:00Z" }),
    ];
    const payload = buildStudentProfile({
      attempts,
      student: STUDENT,
      previews: previewMap,
      assignmentLabels,
      cursor: null,
    });
    const byId = new Map(payload.answers.rows.map((r) => [r.attemptId, r]));
    expect(byId.get("att1")?.assignmentLabel).toBe("Self-practice");
    expect(byId.get("att2")?.assignmentLabel).toBe("Cell Structure Quiz");
    expect(byId.get("att3")?.assignmentLabel).toBe("Assignment");
  });

  it("dedupes assignment-exam attempts (latest answered_at wins per user+assignment+question)", () => {
    const attempts: StudentProfileAttemptRow[] = [
      row({
        id: "att1",
        mode: "exam",
        assignment_id: "asg_1",
        is_correct: false,
        answered_at: "2026-05-22T08:00:00Z",
      }),
      row({
        id: "att2",
        mode: "exam",
        assignment_id: "asg_1",
        is_correct: true,
        answered_at: "2026-05-22T08:05:00Z",
      }),
      row({
        id: "att3",
        mode: "practice",
        is_correct: false,
        answered_at: "2026-05-22T08:10:00Z",
      }),
    ];
    const payload = buildStudentProfile({
      attempts,
      student: STUDENT,
      previews: previewMap,
      assignmentLabels,
      cursor: null,
    });
    expect(payload.summary.totalAttempts).toBe(2); // 1 deduped exam + 1 practice
    expect(payload.summary.totalCorrect).toBe(1);
  });

  it("derives filter options only from the student's actual history", () => {
    const attempts: StudentProfileAttemptRow[] = [
      row({
        id: "att1",
        assignment_id: "asg_1",
        standard_id: "S_A",
        standard_label: "A",
        answered_at: "2026-05-22T08:00:00Z",
      }),
      row({
        id: "att2",
        assignment_id: null,
        standard_id: "S_B",
        standard_label: "B",
        answered_at: "2026-05-22T08:01:00Z",
      }),
      row({
        id: "att3",
        assignment_id: "asg_unknown",
        standard_id: "S_A",
        standard_label: "A",
        answered_at: "2026-05-22T08:02:00Z",
      }),
    ];
    const payload = buildStudentProfile({
      attempts,
      student: STUDENT,
      previews: previewMap,
      assignmentLabels,
      cursor: null,
    });
    expect(payload.filters.assignments.map((a) => a.id).sort()).toEqual([
      "asg_1",
      "asg_unknown",
    ]);
    expect(payload.filters.standards.map((s) => s.id).sort()).toEqual([
      "S_A",
      "S_B",
    ]);
  });

  it("status classification follows STUDENT_* thresholds", () => {
    const tests = [
      { accuracy: 0.75, expected: "on_track" as const },
      { accuracy: 0.6, expected: "watch" as const },
      { accuracy: 0.3, expected: "struggling" as const },
    ];
    for (const t of tests) {
      // Construct 10 attempts with the right ratio of correct answers.
      const correctCount = Math.round(t.accuracy * 10);
      const attempts: StudentProfileAttemptRow[] = Array.from(
        { length: 10 },
        (_, i) => {
          const minute = i.toString().padStart(2, "0");
          return row({
            id: `att${i + 1}`,
            is_correct: i < correctCount,
            answered_at: `2026-05-22T08:${minute}:00Z`,
          });
        },
      );
      const payload = buildStudentProfile({
        attempts,
        student: STUDENT,
        previews: previewMap,
        assignmentLabels,
        cursor: null,
      });
      expect(payload.summary.status).toBe(t.expected);
    }
  });

  it("breaks answered_at ties by attemptId ASC (deterministic order)", () => {
    const attempts: StudentProfileAttemptRow[] = [
      row({ id: "att_c", answered_at: "2026-05-22T08:00:00Z" }),
      row({ id: "att_a", answered_at: "2026-05-22T08:00:00Z" }),
      row({ id: "att_b", answered_at: "2026-05-22T08:00:00Z" }),
    ];
    const payload = buildStudentProfile({
      attempts,
      student: STUDENT,
      previews: previewMap,
      assignmentLabels,
      cursor: null,
    });
    expect(payload.chart.length).toBe(3);
    expect(payload.answers.rows.map((r) => r.attemptId)).toEqual([
      "att_a",
      "att_b",
      "att_c",
    ]);
  });
});
