import { describe, expect, it } from "vitest";
import {
  buildDashboardResponse,
  type AttemptRecord,
} from "./teacher-dashboard-server";

const students = [
  { id: "s1", label: "Alex L.", classId: "c1" },
  { id: "s2", label: "Jamie L.", classId: "c1" },
  { id: "s3", label: "Maya K.", classId: "c2" },
  { id: "s4", label: "Not Started", classId: "c2" },
];

function attempt(
  userId: string,
  standardId: string,
  isCorrect: boolean,
  timeSpentSec: number,
  topic = "Cell Division",
  overrides: Partial<AttemptRecord> = {},
): AttemptRecord {
  return {
    userId,
    standardId,
    standardLabel: standardId,
    topic,
    mode: "practice",
    isCorrect,
    timeSpentSec,
    assignmentId: null,
    ...overrides,
  };
}

describe("buildDashboardResponse", () => {
  it("returns empty breakdown when there are no attempts", () => {
    const result = buildDashboardResponse({
      attempts: [],
      scopedStudents: students,
      selectedStudentId: null,
    });
    expect(result.summary.completionRate).toBe(0);
    expect(result.summary.overallAccuracy).toBe(0);
    expect(result.byStudent).toHaveLength(students.length);
    expect(result.byStudent.every((row) => row.status === "not_started")).toBe(true);
    expect(result.summary.breakdown.notStarted).toBe(students.length);
  });

  it("computes accuracy, average time, and student status buckets", () => {
    const attempts: AttemptRecord[] = [
      // Alex: 10 attempts, 8 correct, 60s average -> on_track
      ...Array.from({ length: 10 }, (_, index) =>
        attempt("s1", "BIO.1.1", index < 8, 60),
      ),
      // Jamie: 10 attempts, 3 correct, 20s average -> low+fast, struggling
      ...Array.from({ length: 10 }, (_, index) =>
        attempt("s2", "BIO.1.2", index < 3, 20),
      ),
      // Maya: 10 attempts, 6 correct, 90s average -> watch
      ...Array.from({ length: 10 }, (_, index) =>
        attempt("s3", "BIO.1.1", index < 6, 90),
      ),
    ];

    const result = buildDashboardResponse({
      attempts,
      scopedStudents: students,
      selectedStudentId: null,
    });

    expect(result.summary.totalAnswered).toBe(30);
    expect(result.summary.totalCorrect).toBe(17);
    expect(result.summary.overallAccuracy).toBeCloseTo(57, 0);
    expect(result.summary.studentsTotal).toBe(4);
    expect(result.summary.studentsAttempted).toBe(3);
    expect(result.summary.completionRate).toBe(75);

    const byStudent = Object.fromEntries(
      result.byStudent.map((row) => [row.studentId, row]),
    );
    expect(byStudent.s1.status).toBe("on_track");
    expect(byStudent.s2.status).toBe("struggling");
    expect(byStudent.s2.isLowAndFast).toBe(true);
    expect(byStudent.s3.status).toBe("watch");
    expect(byStudent.s4.status).toBe("not_started");
    expect(result.lowAndFastCount).toBe(1);

    expect(result.summary.breakdown).toEqual({
      onTrack: 1,
      watch: 1,
      struggling: 1,
      notStarted: 1,
    });
  });

  it("filters attempts by topic and returns available topics", () => {
    const attempts: AttemptRecord[] = [
      attempt("s1", "BIO.1.1", true, 60, "Cell Division"),
      attempt("s1", "BIO.1.2", false, 60, "Genetics"),
      attempt("s2", "BIO.1.1", false, 60, "Cell Division"),
    ];

    const result = buildDashboardResponse({
      attempts,
      topic: "Cell Division",
      scopedStudents: students,
      selectedStudentId: null,
    });

    expect(result.summary.totalAnswered).toBe(2);
    expect(result.topics).toEqual(["Cell Division", "Genetics"]);
  });

  it("restricts rows when a specific student is selected", () => {
    const attempts: AttemptRecord[] = [
      attempt("s1", "BIO.1.1", true, 60),
      attempt("s2", "BIO.1.2", false, 60),
    ];

    const result = buildDashboardResponse({
      attempts,
      scopedStudents: students,
      selectedStudentId: "s1",
    });

    expect(result.byStudent).toHaveLength(1);
    expect(result.byStudent[0].studentId).toBe("s1");
    expect(result.summary.totalAnswered).toBe(1);
  });

  it("classifies standards with needs_review when accuracy is very low", () => {
    const attempts: AttemptRecord[] = [
      ...Array.from({ length: 10 }, (_, index) =>
        attempt("s1", "BIO.1.3", index < 4, 70),
      ),
    ];

    const result = buildDashboardResponse({
      attempts,
      scopedStudents: students,
      selectedStudentId: null,
    });

    const row = result.byStandard.find((item) => item.standardId === "BIO.1.3");
    expect(row?.status).toBe("needs_review");
    expect(row?.accuracy).toBe(40);
  });
});
