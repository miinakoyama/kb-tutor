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
  timeSpentSec: number | null,
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
      // Alex: 10 attempts, 8 correct (80%), 60s average -> proficient
      ...Array.from({ length: 10 }, (_, index) =>
        attempt("s1", "BIO.1.1", index < 8, 60),
      ),
      // Jamie: 10 attempts, 3 correct (30%), 20s average -> low+fast, below_basic
      ...Array.from({ length: 10 }, (_, index) =>
        attempt("s2", "BIO.1.2", index < 3, 20),
      ),
      // Maya: 10 attempts, 6 correct (60%), 90s average -> basic
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
    expect(byStudent.s1.status).toBe("proficient");
    expect(byStudent.s2.status).toBe("below_basic");
    expect(byStudent.s2.isLowAndFast).toBe(true);
    expect(byStudent.s3.status).toBe("basic");
    expect(byStudent.s4.status).toBe("not_started");
    expect(result.lowAndFastCount).toBe(1);

    expect(result.summary.breakdown).toEqual({
      advanced: 0,
      proficient: 1,
      basic: 1,
      belowBasic: 1,
      notStarted: 1,
    });
  });

  it("classifies students above 85% accuracy as advanced", () => {
    const attempts: AttemptRecord[] = Array.from({ length: 10 }, (_, index) =>
      attempt("s1", "BIO.1.1", index < 9, 60),
    );
    const result = buildDashboardResponse({
      attempts,
      scopedStudents: students,
      selectedStudentId: null,
    });
    const row = result.byStudent.find((r) => r.studentId === "s1");
    expect(row?.status).toBe("advanced");
    expect(result.summary.breakdown.advanced).toBe(1);
  });

  it("respects custom thresholds when provided", () => {
    const attempts: AttemptRecord[] = Array.from({ length: 10 }, (_, index) =>
      attempt("s1", "BIO.1.1", index < 6, 60),
    );
    // With defaults 60% would be "basic" (50 <= 60 < 70). Tighten thresholds
    // so 60% should fall into "below_basic" instead.
    const result = buildDashboardResponse({
      attempts,
      scopedStudents: students,
      selectedStudentId: null,
      thresholds: {
        student: { basicMin: 70, proficientMin: 80, advancedMin: 90 },
        standard: { basicMin: 70, proficientMin: 80, advancedMin: 90 },
      },
    });
    const row = result.byStudent.find((r) => r.studentId === "s1");
    expect(row?.accuracy).toBe(60);
    expect(row?.status).toBe("below_basic");
    expect(result.thresholds.student.basicMin).toBe(70);
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

  it("keeps attempts with null standardId separated by topic (does not merge unrelated topics)", () => {
    const attempts: AttemptRecord[] = [
      attempt("s1", "", true, 60, "Cell Division", { standardId: null }),
      attempt("s1", "", false, 60, "Cell Division", { standardId: null }),
      attempt("s2", "", true, 60, "Genetics", { standardId: null }),
    ];

    const result = buildDashboardResponse({
      attempts,
      scopedStudents: students,
      selectedStudentId: null,
    });

    // Two separate rows — one per topic, not a single merged bucket
    const otherRows = result.byStandard.filter((row) =>
      row.standardId.startsWith("BIO.OTHER"),
    );
    expect(otherRows).toHaveLength(2);
    const labels = otherRows.map((row) => row.standardLabel).sort();
    expect(labels).toEqual(["Cell Division", "Genetics"]);
  });

  it("uses the canonical label from standards.ts, ignoring stale attempt labels", () => {
    const attempts: AttemptRecord[] = [
      attempt("s1", "3.1.9-12.A", true, 60, "Structure and Function", {
        standardLabel: "Outdated or custom label from older question bank",
      }),
      attempt("s2", "3.1.9-12.A", false, 60, "Structure and Function", {
        standardLabel: "Another stale label",
      }),
    ];

    const result = buildDashboardResponse({
      attempts,
      scopedStudents: students,
      selectedStudentId: null,
    });

    const row = result.byStandard.find(
      (item) => item.standardId === "3.1.9-12.A",
    );
    expect(row?.standardLabel).toBe(
      "Construct an explanation based on evidence for how the structure of DNA determines the structure of proteins, which carry out the essential functions of life through systems of specialized cells.",
    );
  });

  it("produces per-mode breakdown when includeModeBreakdown is true", () => {
    const attempts: AttemptRecord[] = [
      // Practice on standard A: 10 attempts, 9 correct, 50s avg
      ...Array.from({ length: 10 }, (_, index) =>
        attempt("s1", "3.1.9-12.A", index < 9, 50, "Structure and Function", {
          mode: "practice",
        }),
      ),
      // Exam on standard A: 5 attempts, 3 correct, 80s avg
      ...Array.from({ length: 5 }, (_, index) =>
        attempt("s1", "3.1.9-12.A", index < 3, 80, "Structure and Function", {
          mode: "exam",
        }),
      ),
      // Review on standard A: 4 attempts, 2 correct, 40s avg
      ...Array.from({ length: 4 }, (_, index) =>
        attempt("s1", "3.1.9-12.A", index < 2, 40, "Structure and Function", {
          mode: "review",
        }),
      ),
    ];

    const result = buildDashboardResponse({
      attempts,
      scopedStudents: students,
      selectedStudentId: null,
      includeModeBreakdown: true,
    });

    const row = result.byStandard.find(
      (item) => item.standardId === "3.1.9-12.A",
    );
    expect(row?.byMode).toBeDefined();
    expect(row?.byMode?.practice).toEqual({
      attempted: 10,
      correct: 9,
      accuracy: 90,
      averageTimeSec: 50,
      studentsAttempted: 1,
    });
    expect(row?.byMode?.exam).toEqual({
      attempted: 5,
      correct: 3,
      accuracy: 60,
      averageTimeSec: 80,
      studentsAttempted: 1,
    });
    expect(row?.byMode?.review).toEqual({
      attempted: 4,
      correct: 2,
      accuracy: 50,
      averageTimeSec: 40,
      studentsAttempted: 1,
    });

    // Overall still aggregates all attempts
    expect(row?.attempted).toBe(19);
    expect(row?.correct).toBe(14);

    // Summary should also include byMode
    expect(result.summary.byMode?.practice.attempted).toBe(10);
    expect(result.summary.byMode?.practice.studentsAttempted).toBe(1);
    expect(result.summary.byMode?.exam.accuracy).toBe(60);
    expect(result.summary.byMode?.review.attempted).toBe(4);
  });

  it("counts compare students as the union of students with attempts across modes", () => {
    const attempts: AttemptRecord[] = [
      attempt("s1", "3.1.9-12.A", true, 60, "Structure and Function", {
        mode: "practice",
      }),
      attempt("s2", "3.1.9-12.A", false, 80, "Structure and Function", {
        mode: "exam",
      }),
      attempt("s3", "3.1.9-12.A", true, 40, "Structure and Function", {
        mode: "review",
      }),
      attempt("s3", "3.1.9-12.A", false, 35, "Structure and Function", {
        mode: "practice",
      }),
    ];

    const result = buildDashboardResponse({
      attempts,
      scopedStudents: students,
      selectedStudentId: null,
      includeModeBreakdown: true,
    });

    expect(result.summary.studentsTotal).toBe(4);
    expect(result.summary.studentsAttempted).toBe(3);
    expect(result.summary.completionRate).toBe(75);
    expect(result.summary.byMode?.practice.studentsAttempted).toBe(2);
    expect(result.summary.byMode?.exam.studentsAttempted).toBe(1);
    expect(result.summary.byMode?.review.studentsAttempted).toBe(1);

    const row = result.byStandard.find(
      (item) => item.standardId === "3.1.9-12.A",
    );
    expect(row?.byMode?.practice.studentsAttempted).toBe(2);
    expect(row?.byMode?.exam.studentsAttempted).toBe(1);
    expect(row?.byMode?.review.studentsAttempted).toBe(1);
  });

  it("excludes attempts with null time from average time (legacy unmeasured)", () => {
    const attempts: AttemptRecord[] = [
      attempt("s1", "BIO.1.1", true, 60),
      attempt("s1", "BIO.1.1", true, null),
      attempt("s1", "BIO.1.1", false, null),
    ];

    const result = buildDashboardResponse({
      attempts,
      scopedStudents: students,
      selectedStudentId: null,
    });

    expect(result.summary.totalAnswered).toBe(3);
    expect(result.summary.avgTimeSec).toBe(60);

    const row = result.byStandard.find((item) => item.standardId === "BIO.1.1");
    expect(row?.attempted).toBe(3);
    expect(row?.averageTimeSec).toBe(60);
  });

  it("omits byMode when includeModeBreakdown is false", () => {
    const attempts: AttemptRecord[] = [
      attempt("s1", "3.1.9-12.A", true, 60, "Structure and Function", {
        mode: "practice",
      }),
    ];

    const result = buildDashboardResponse({
      attempts,
      scopedStudents: students,
      selectedStudentId: null,
    });

    const row = result.byStandard.find(
      (item) => item.standardId === "3.1.9-12.A",
    );
    expect(row?.byMode).toBeUndefined();
    expect(result.summary.byMode).toBeUndefined();
  });

  it("classifies standards as below_basic when accuracy is very low", () => {
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
    expect(row?.status).toBe("below_basic");
    expect(row?.accuracy).toBe(40);
  });
});
