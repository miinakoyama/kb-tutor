import { describe, expect, it } from "vitest";
import {
  buildAssignmentProgress,
  classifyAssignmentProgress,
  filterAssignmentProgressRowsByQuery,
  sortAssignmentProgressRows,
  type AssignmentInfo,
  type AssignmentTargetRow,
  type AttemptProgressRow,
  type StudentProgressRow,
} from "./assignment-progress";

const students = [
  { id: "s1", label: "Alex L.", classId: "c1" },
  { id: "s2", label: "Jamie L.", classId: "c1" },
  { id: "s3", label: "Maya K.", classId: "c1" },
];

const assignment1: AssignmentInfo = {
  id: "a1",
  title: "Assignment 1",
  schoolId: "c1",
  dueDate: "2026-05-01T00:00:00Z",
  totalQuestions: 10,
  mode: "practice",
};
const assignment2: AssignmentInfo = {
  id: "a2",
  title: "Assignment 2",
  schoolId: "c1",
  dueDate: null,
  totalQuestions: 5,
  mode: "exam",
};

describe("classifyAssignmentProgress", () => {
  it("returns completed when last_completed_at is present", () => {
    expect(classifyAssignmentProgress("2026-04-20T00:00:00Z", 0)).toBe("completed");
    expect(classifyAssignmentProgress("2026-04-20T00:00:00Z", 3)).toBe("completed");
  });

  it("returns in_progress when some attempts exist", () => {
    expect(classifyAssignmentProgress(null, 1)).toBe("in_progress");
    expect(classifyAssignmentProgress(null, 9)).toBe("in_progress");
  });

  it("returns not_started when no attempts and not completed", () => {
    expect(classifyAssignmentProgress(null, 0)).toBe("not_started");
  });
});

describe("buildAssignmentProgress", () => {
  it("returns empty rows when there are no students", () => {
    const result = buildAssignmentProgress({
      assignments: [assignment1],
      targets: [],
      attempts: [],
      students: [],
    });
    expect(result.rows).toHaveLength(0);
    expect(result.assignments[0].totalTargets).toBe(0);
  });

  it("classifies each student based on targets, attempts, and completion", () => {
    const targets: AssignmentTargetRow[] = [
      { assignmentId: "a1", studentUserId: "s1", lastCompletedAt: "2026-04-20T00:00:00Z" },
      { assignmentId: "a1", studentUserId: "s2", lastCompletedAt: null },
      { assignmentId: "a1", studentUserId: "s3", lastCompletedAt: null },
      { assignmentId: "a2", studentUserId: "s1", lastCompletedAt: null },
    ];
    const attempts: AttemptProgressRow[] = [
      { userId: "s2", assignmentId: "a1", questionId: "q1" },
      { userId: "s2", assignmentId: "a1", questionId: "q2" },
      // s2 answered q1 twice — should still count as 1 distinct
      { userId: "s2", assignmentId: "a1", questionId: "q1" },
    ];

    const result = buildAssignmentProgress({
      assignments: [assignment1, assignment2],
      targets,
      attempts,
      students,
    });

    const s1 = result.rows.find((r) => r.studentId === "s1")!;
    const s2 = result.rows.find((r) => r.studentId === "s2")!;
    const s3 = result.rows.find((r) => r.studentId === "s3")!;

    expect(s1.progress.a1.status).toBe("completed");
    expect(s1.progress.a2.status).toBe("not_started");
    expect(s1.completedCount).toBe(1);
    expect(s1.notStartedCount).toBe(1);

    expect(s2.progress.a1.status).toBe("in_progress");
    expect(s2.progress.a1.answeredCount).toBe(2);
    expect(s2.progress.a2?.status).toBe("not_started");

    expect(s3.progress.a1.status).toBe("not_started");
    expect(s3.progress.a2?.status).toBe("not_started");

    const a1Summary = result.assignments.find((a) => a.assignmentId === "a1")!;
    expect(a1Summary.totalTargets).toBe(3);
    expect(a1Summary.completedCount).toBe(1);
    expect(a1Summary.inProgressCount).toBe(1);
    expect(a1Summary.notStartedCount).toBe(1);
  });

  it("sorts assignments by due date ascending, then by title", () => {
    const a1: AssignmentInfo = {
      id: "a1",
      title: "Beta",
      schoolId: "c1",
      dueDate: "2026-06-01T00:00:00Z",
      totalQuestions: 10,
      mode: "practice",
    };
    const a2: AssignmentInfo = {
      id: "a2",
      title: "Alpha",
      schoolId: "c1",
      dueDate: "2026-05-01T00:00:00Z",
      totalQuestions: 10,
      mode: "practice",
    };
    const a3: AssignmentInfo = {
      id: "a3",
      title: "Zeta",
      schoolId: "c1",
      dueDate: null,
      totalQuestions: 10,
      mode: "practice",
    };
    const result = buildAssignmentProgress({
      assignments: [a1, a2, a3],
      targets: [],
      attempts: [],
      students,
    });
    expect(result.assignments.map((a) => a.assignmentId)).toEqual(["a2", "a1", "a3"]);
  });

  it("ignores attempts for students outside the scope", () => {
    const targets: AssignmentTargetRow[] = [
      { assignmentId: "a1", studentUserId: "s1", lastCompletedAt: null },
    ];
    const attempts: AttemptProgressRow[] = [
      { userId: "outsider", assignmentId: "a1", questionId: "q1" },
      { userId: "s1", assignmentId: "a1", questionId: "q1" },
    ];
    const result = buildAssignmentProgress({
      assignments: [assignment1],
      targets,
      attempts,
      students,
    });
    const s1 = result.rows.find((r) => r.studentId === "s1")!;
    expect(s1.progress.a1.answeredCount).toBe(1);
    expect(s1.progress.a1.status).toBe("in_progress");
  });

  it("treats same-school students as not_started when assignment_targets row is missing", () => {
    const result = buildAssignmentProgress({
      assignments: [assignment1],
      targets: [
        { assignmentId: "a1", studentUserId: "s1", lastCompletedAt: null },
      ],
      attempts: [],
      students: [
        { id: "s1", label: "A", classId: "c1" },
        { id: "s2", label: "B", classId: "c1" },
      ],
    });
    const s2 = result.rows.find((r) => r.studentId === "s2")!;
    expect(s2.progress.a1.status).toBe("not_started");
    const a1 = result.assignments.find((a) => a.assignmentId === "a1")!;
    expect(a1.totalTargets).toBe(2);
  });

  it("omits matrix cells when the student's school does not match the assignment", () => {
    const otherSchool: AssignmentInfo = {
      id: "a99",
      title: "Other",
      schoolId: "c2",
      dueDate: null,
      totalQuestions: 1,
      mode: "practice",
    };
    const result = buildAssignmentProgress({
      assignments: [otherSchool],
      targets: [
        { assignmentId: "a99", studentUserId: "s1", lastCompletedAt: "2026-01-01T00:00:00Z" },
      ],
      attempts: [],
      students: [{ id: "s1", label: "A", classId: "c1" }],
    });
    const s1 = result.rows[0]!;
    expect(s1.progress.a99).toBeUndefined();
  });
});

const row = (
  partial: Pick<
    StudentProgressRow,
    | "studentId"
    | "label"
    | "studentIdCode"
    | "completedCount"
    | "inProgressCount"
    | "notStartedCount"
  > &
    Partial<StudentProgressRow>,
): StudentProgressRow => ({
  classId: "c1",
  progress: {},
  studentIdCode: null,
  ...partial,
});

describe("sortAssignmentProgressRows", () => {
  it("follow-up first: more not-started cells rank above", () => {
    const rows = [
      row({ studentId: "a", label: "A", notStartedCount: 1, completedCount: 0, inProgressCount: 0 }),
      row({ studentId: "b", label: "B", notStartedCount: 3, completedCount: 0, inProgressCount: 0 }),
    ];
    const sorted = sortAssignmentProgressRows(rows, "needs_attention");
    expect(sorted.map((r) => r.studentId)).toEqual(["b", "a"]);
  });

  it("needs attention: when not started ties, lower completion % ranks above", () => {
    const rows = [
      row({
        studentId: "a",
        label: "A",
        notStartedCount: 1,
        completedCount: 1,
        inProgressCount: 0,
      }),
      row({
        studentId: "b",
        label: "B",
        notStartedCount: 1,
        completedCount: 0,
        inProgressCount: 1,
      }),
    ];
    const sorted = sortAssignmentProgressRows(rows, "needs_attention");
    expect(sorted.map((r) => r.studentId)).toEqual(["b", "a"]);
  });

  it("highest completion first: higher completion % ranks above", () => {
    const rows = [
      row({
        studentId: "a",
        label: "A",
        notStartedCount: 0,
        completedCount: 1,
        inProgressCount: 0,
      }),
      row({
        studentId: "b",
        label: "B",
        notStartedCount: 0,
        completedCount: 0,
        inProgressCount: 0,
      }),
    ];
    const sorted = sortAssignmentProgressRows(rows, "highest_completion_first");
    expect(sorted.map((r) => r.studentId)).toEqual(["a", "b"]);
  });
});

describe("filterAssignmentProgressRowsByQuery", () => {
  it("matches label, roster id, or user id", () => {
    const rows = [
      row({ studentId: "uuid-1", label: "Alex", studentIdCode: "st100" }),
      row({ studentId: "uuid-2", label: "Bo", studentIdCode: "st200" }),
    ];
    expect(filterAssignmentProgressRowsByQuery(rows, "st1")).toHaveLength(1);
    expect(filterAssignmentProgressRowsByQuery(rows, "ale")).toHaveLength(1);
    expect(filterAssignmentProgressRowsByQuery(rows, "uuid-2")).toHaveLength(1);
  });
});
