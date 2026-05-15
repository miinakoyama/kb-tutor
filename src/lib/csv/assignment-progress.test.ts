import { describe, expect, it } from "vitest";
import type { AssignmentProgressResponse } from "@/lib/analytics/assignment-progress";
import { buildAssignmentProgressCsv } from "@/lib/csv/assignment-progress";

describe("buildAssignmentProgressCsv", () => {
  it("writes student totals and per-assignment progress columns", () => {
    const data: AssignmentProgressResponse = {
      assignments: [
        {
          assignmentId: "as-1",
          title: 'Cell, Practice',
          dueDate: "2026-05-20T00:00:00.000Z",
          mode: "practice",
          totalTargets: 2,
          completedCount: 1,
          inProgressCount: 1,
          notStartedCount: 0,
        },
        {
          assignmentId: "as-2",
          title: "Exam Review",
          dueDate: null,
          mode: "exam",
          totalTargets: 1,
          completedCount: 0,
          inProgressCount: 0,
          notStartedCount: 1,
        },
      ],
      rows: [
        {
          studentId: "student-1",
          studentIdCode: "S-001",
          label: 'Alex "A"',
          classId: "school-1",
          completedCount: 1,
          inProgressCount: 0,
          notStartedCount: 0,
          progress: {
            "as-1": {
              assignmentId: "as-1",
              status: "completed",
              lastCompletedAt: "2026-05-14T12:00:00.000Z",
              answeredCount: 4,
              totalQuestions: 4,
            },
          },
        },
        {
          studentId: "student-2",
          studentIdCode: null,
          label: "Jamie",
          classId: "school-1",
          completedCount: 0,
          inProgressCount: 1,
          notStartedCount: 1,
          progress: {
            "as-1": {
              assignmentId: "as-1",
              status: "in_progress",
              lastCompletedAt: null,
              answeredCount: 2,
              totalQuestions: 4,
            },
            "as-2": {
              assignmentId: "as-2",
              status: "not_started",
              lastCompletedAt: null,
              answeredCount: 0,
              totalQuestions: 5,
            },
          },
        },
      ],
    };

    const csv = buildAssignmentProgressCsv(data);
    const lines = csv.split("\n");

    expect(lines[0]).toBe(
      'student_user_id,student_id,student_label,school_id,completed_count,in_progress_count,not_started_count,"Cell, Practice status","Cell, Practice answered_count","Cell, Practice total_questions","Cell, Practice completed_at",Exam Review status,Exam Review answered_count,Exam Review total_questions,Exam Review completed_at',
    );
    expect(lines[1]).toBe(
      'student-1,S-001,"Alex ""A""",school-1,1,0,0,completed,4,4,2026-05-14T12:00:00.000Z,not_assigned,,,',
    );
    expect(lines[2]).toBe(
      "student-2,,Jamie,school-1,0,1,1,in_progress,2,4,,not_started,0,5,",
    );
  });

  it("can export a filtered row subset", () => {
    const data: AssignmentProgressResponse = {
      assignments: [],
      rows: [
        {
          studentId: "student-1",
          studentIdCode: "S-001",
          label: "Alex",
          classId: "school-1",
          completedCount: 0,
          inProgressCount: 0,
          notStartedCount: 0,
          progress: {},
        },
        {
          studentId: "student-2",
          studentIdCode: "S-002",
          label: "Jamie",
          classId: "school-1",
          completedCount: 0,
          inProgressCount: 0,
          notStartedCount: 0,
          progress: {},
        },
      ],
    };

    const csv = buildAssignmentProgressCsv(data, [data.rows[1]!]);

    expect(csv).not.toContain("student-1");
    expect(csv).toContain("student-2,S-002,Jamie");
  });

  it("includes every provided student row in larger exports", () => {
    const data: AssignmentProgressResponse = {
      assignments: [
        {
          assignmentId: "as-1",
          title: "Practice Set",
          dueDate: null,
          mode: "practice",
          totalTargets: 150,
          completedCount: 0,
          inProgressCount: 0,
          notStartedCount: 150,
        },
      ],
      rows: Array.from({ length: 150 }, (_, index) => {
        const number = index + 1;
        return {
          studentId: `student-${number}`,
          studentIdCode: `S-${String(number).padStart(3, "0")}`,
          label: `Student ${number}`,
          classId: "school-1",
          completedCount: 0,
          inProgressCount: 0,
          notStartedCount: 1,
          progress: {
            "as-1": {
              assignmentId: "as-1",
              status: "not_started",
              lastCompletedAt: null,
              answeredCount: 0,
              totalQuestions: 5,
            },
          },
        };
      }),
    };

    const csv = buildAssignmentProgressCsv(data);
    const lines = csv.split("\n");

    expect(lines).toHaveLength(151);
    expect(csv).toContain("student-1,S-001,Student 1");
    expect(csv).toContain("student-150,S-150,Student 150");
  });

  it("neutralizes formula-leading text values", () => {
    const data: AssignmentProgressResponse = {
      assignments: [
        {
          assignmentId: "as-1",
          title: "=Formula Assignment",
          dueDate: null,
          mode: "practice",
          totalTargets: 1,
          completedCount: 0,
          inProgressCount: 0,
          notStartedCount: 1,
        },
      ],
      rows: [
        {
          studentId: "student-1",
          studentIdCode: "+S-001",
          label: "@Student",
          classId: "-school-1",
          completedCount: 0,
          inProgressCount: 0,
          notStartedCount: 1,
          progress: {
            "as-1": {
              assignmentId: "as-1",
              status: "not_started",
              lastCompletedAt: null,
              answeredCount: 0,
              totalQuestions: 5,
            },
          },
        },
      ],
    };

    const csv = buildAssignmentProgressCsv(data);

    expect(csv).toContain("'=Formula Assignment status");
    expect(csv).toContain("student-1,'+S-001,'@Student,'-school-1");
  });

  it("neutralizes formula-leading text after leading whitespace or controls", () => {
    const data: AssignmentProgressResponse = {
      assignments: [
        {
          assignmentId: "as-1",
          title: "\t=HYPERLINK(\"https://example.com\")",
          dueDate: null,
          mode: "practice",
          totalTargets: 1,
          completedCount: 0,
          inProgressCount: 0,
          notStartedCount: 1,
        },
      ],
      rows: [
        {
          studentId: "student-1",
          studentIdCode: "\r=HYPERLINK(\"https://example.com\")",
          label: " \t+SUM(1,1)",
          classId: "\u0000@cmd",
          completedCount: 0,
          inProgressCount: 0,
          notStartedCount: 1,
          progress: {
            "as-1": {
              assignmentId: "as-1",
              status: "not_started",
              lastCompletedAt: null,
              answeredCount: 0,
              totalQuestions: 5,
            },
          },
        },
      ],
    };

    const csv = buildAssignmentProgressCsv(data);
    const lines = csv.split("\n");

    expect(lines[0]).toContain(
      '"\'\t=HYPERLINK(""https://example.com"") status"',
    );
    expect(lines[1]).toContain(
      'student-1,"\'\r=HYPERLINK(""https://example.com"")","\' \t+SUM(1,1)",\'\u0000@cmd',
    );
  });

  it("disambiguates duplicate assignment title headers without raw ids", () => {
    const data: AssignmentProgressResponse = {
      assignments: [
        {
          assignmentId: "as-1",
          title: "Unit Review",
          dueDate: "2026-05-20T00:00:00.000Z",
          mode: "practice",
          totalTargets: 1,
          completedCount: 0,
          inProgressCount: 0,
          notStartedCount: 1,
        },
        {
          assignmentId: "as-2",
          title: "Unit Review",
          dueDate: "2026-05-21T00:00:00.000Z",
          mode: "exam",
          totalTargets: 1,
          completedCount: 0,
          inProgressCount: 0,
          notStartedCount: 1,
        },
        {
          assignmentId: "as-3",
          title: "Unit Review",
          dueDate: "2026-05-21T00:00:00.000Z",
          mode: "exam",
          totalTargets: 1,
          completedCount: 0,
          inProgressCount: 0,
          notStartedCount: 1,
        },
      ],
      rows: [],
    };

    const [header] = buildAssignmentProgressCsv(data).split("\n");

    expect(header).toContain("Unit Review - practice - 2026-05-20 status");
    expect(header).toContain("Unit Review - exam - 2026-05-21 status");
    expect(header).toContain("Unit Review - exam - 2026-05-21 #2 status");
    expect(header).not.toContain("as-1");
    expect(header).not.toContain("as-2");
    expect(header).not.toContain("as-3");
  });
});
