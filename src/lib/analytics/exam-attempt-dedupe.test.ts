import { describe, expect, it } from "vitest";
import { dedupeAssignmentExamAttempts } from "./exam-attempt-dedupe";

type Row = {
  user_id: string;
  question_id: string;
  mode: string | null;
  assignment_id: string | null;
  answered_at: string;
  selected_option_id: string;
};

describe("dedupeAssignmentExamAttempts", () => {
  it("keeps only the latest row per (user, assignment, question) for exam assignment rows", () => {
    const rows: Row[] = [
      {
        user_id: "u1",
        question_id: "q1",
        mode: "exam",
        assignment_id: "a1",
        answered_at: "2026-04-20T10:00:00.000Z",
        selected_option_id: "A",
      },
      {
        user_id: "u1",
        question_id: "q1",
        mode: "exam",
        assignment_id: "a1",
        answered_at: "2026-04-20T10:01:00.000Z",
        selected_option_id: "B",
      },
      {
        user_id: "u1",
        question_id: "q2",
        mode: "exam",
        assignment_id: "a1",
        answered_at: "2026-04-20T10:02:00.000Z",
        selected_option_id: "D",
      },
      {
        user_id: "u1",
        question_id: "q1",
        mode: "practice",
        assignment_id: null,
        answered_at: "2026-04-20T10:03:00.000Z",
        selected_option_id: "C",
      },
    ];

    const deduped = dedupeAssignmentExamAttempts(rows);

    expect(deduped).toHaveLength(3);
    expect(
      deduped.find(
        (row) =>
          row.mode === "exam" &&
          row.assignment_id === "a1" &&
          row.question_id === "q1",
      )?.selected_option_id,
    ).toBe("B");
    expect(
      deduped.filter(
        (row) =>
          row.mode === "exam" &&
          row.assignment_id === "a1" &&
          row.question_id === "q1",
      ),
    ).toHaveLength(1);
  });

  it("does not collapse non-exam or non-assignment rows", () => {
    const rows: Row[] = [
      {
        user_id: "u1",
        question_id: "q1",
        mode: "exam",
        assignment_id: null,
        answered_at: "2026-04-20T10:00:00.000Z",
        selected_option_id: "A",
      },
      {
        user_id: "u1",
        question_id: "q1",
        mode: "exam",
        assignment_id: null,
        answered_at: "2026-04-20T10:01:00.000Z",
        selected_option_id: "B",
      },
      {
        user_id: "u1",
        question_id: "q1",
        mode: "practice",
        assignment_id: "a1",
        answered_at: "2026-04-20T10:02:00.000Z",
        selected_option_id: "C",
      },
      {
        user_id: "u1",
        question_id: "q1",
        mode: "practice",
        assignment_id: "a1",
        answered_at: "2026-04-20T10:03:00.000Z",
        selected_option_id: "D",
      },
    ];

    const deduped = dedupeAssignmentExamAttempts(rows);
    expect(deduped).toHaveLength(4);
  });
});
