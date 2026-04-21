import { describe, expect, it } from "vitest";
import {
  buildAssignmentProgress,
  classifyAssignmentProgress,
  type AssignmentInfo,
  type AssignmentTargetRow,
  type AttemptProgressRow,
} from "./assignment-progress";

const students = [
  { id: "s1", label: "Alex L.", classId: "c1" },
  { id: "s2", label: "Jamie L.", classId: "c1" },
  { id: "s3", label: "Maya K.", classId: "c2" },
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
    expect(s2.progress.a2).toBeUndefined();

    expect(s3.progress.a1.status).toBe("not_started");
    expect(s3.progress.a2).toBeUndefined();

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
});
