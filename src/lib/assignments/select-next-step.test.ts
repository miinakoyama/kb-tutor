import { describe, expect, it } from "vitest";
import { selectNextStep } from "./select-next-step";
import type {
  StudentAssignmentListItem,
  StudentAssignmentStatus,
} from "@/lib/student-assignments";

const NOW = new Date("2025-06-15T12:00:00Z");

// Minimal factory — only the fields selectNextStep actually reads.
function makeAssignment(
  overrides: Partial<StudentAssignmentListItem> & {
    id: string;
    status: StudentAssignmentStatus;
  },
): StudentAssignmentListItem {
  return {
    title: overrides.id,
    due_date: null,
    topics: [],
    target_minutes: 20,
    mode: "practice",
    randomize_order: true,
    max_questions: null,
    instructions: null,
    max_attempts: null,
    completed_attempts: 0,
    recorded_completion_count: 0,
    last_completed_at: null,
    progress: { answered: 0, total: 10 },
    accuracy: null,
    ...overrides,
  };
}

const PAST = "2025-06-01T00:00:00Z"; // before NOW → overdue
const NEAR = "2025-06-20T00:00:00Z"; // after NOW, soon
const FAR = "2025-07-01T00:00:00Z"; // after NOW, later

describe("selectNextStep", () => {
  it("returns null nextStep and empty others when there are no assignments", () => {
    expect(selectNextStep([], NOW)).toEqual({ nextStep: null, others: [] });
  });

  it("returns null nextStep and empty others when all assignments are completed", () => {
    const a = makeAssignment({ id: "a", status: "completed" });
    expect(selectNextStep([a], NOW)).toEqual({ nextStep: null, others: [] });
  });

  it("picks the single incomplete assignment as nextStep", () => {
    const a = makeAssignment({ id: "a", status: "not_started" });
    const { nextStep, others } = selectNextStep([a], NOW);
    expect(nextStep?.id).toBe("a");
    expect(others).toHaveLength(0);
  });

  it("excludes completed assignments from both nextStep and others", () => {
    const done = makeAssignment({ id: "done", status: "completed" });
    const todo = makeAssignment({ id: "todo", status: "not_started" });
    const { nextStep, others } = selectNextStep([done, todo], NOW);
    expect(nextStep?.id).toBe("todo");
    expect(others).toHaveLength(0);
  });

  it("prefers in_progress over not_started regardless of due date", () => {
    const inProgress = makeAssignment({
      id: "ip",
      status: "in_progress",
      due_date: FAR,
    });
    const notStarted = makeAssignment({
      id: "ns",
      status: "not_started",
      due_date: NEAR,
    });
    const { nextStep } = selectNextStep([notStarted, inProgress], NOW);
    expect(nextStep?.id).toBe("ip");
  });

  it("prefers in_progress not-overdue over in_progress overdue", () => {
    const overdueIP = makeAssignment({
      id: "ip-overdue",
      status: "in_progress",
      due_date: PAST,
    });
    const onTimeIP = makeAssignment({
      id: "ip-ontime",
      status: "in_progress",
      due_date: FAR,
    });
    const { nextStep } = selectNextStep([overdueIP, onTimeIP], NOW);
    expect(nextStep?.id).toBe("ip-ontime");
  });

  it("prefers not_started overdue over not_started not-overdue", () => {
    const overdueNS = makeAssignment({
      id: "ns-overdue",
      status: "not_started",
      due_date: PAST,
    });
    const onTimeNS = makeAssignment({
      id: "ns-ontime",
      status: "not_started",
      due_date: NEAR,
    });
    const { nextStep } = selectNextStep([onTimeNS, overdueNS], NOW);
    expect(nextStep?.id).toBe("ns-overdue");
  });

  it("breaks ties within a tier by earliest due date", () => {
    const later = makeAssignment({
      id: "later",
      status: "in_progress",
      due_date: FAR,
    });
    const sooner = makeAssignment({
      id: "sooner",
      status: "in_progress",
      due_date: NEAR,
    });
    const { nextStep, others } = selectNextStep([later, sooner], NOW);
    expect(nextStep?.id).toBe("sooner");
    expect(others[0].id).toBe("later");
  });

  it("sorts a missing due date last within its tier", () => {
    const withDue = makeAssignment({
      id: "has-due",
      status: "not_started",
      due_date: FAR,
    });
    const noDue = makeAssignment({
      id: "no-due",
      status: "not_started",
      due_date: null,
    });
    const { nextStep } = selectNextStep([noDue, withDue], NOW);
    expect(nextStep?.id).toBe("has-due");
  });

  it("full priority order: ip-ontime > ip-overdue > ns-overdue > ns-ontime > ns-nodue", () => {
    const ipOntime = makeAssignment({
      id: "ip-ontime",
      status: "in_progress",
      due_date: NEAR,
    });
    const ipOverdue = makeAssignment({
      id: "ip-overdue",
      status: "in_progress",
      due_date: PAST,
    });
    const nsOverdue = makeAssignment({
      id: "ns-overdue",
      status: "not_started",
      due_date: PAST,
    });
    const nsOntime = makeAssignment({
      id: "ns-ontime",
      status: "not_started",
      due_date: NEAR,
    });
    const nsNoDue = makeAssignment({
      id: "ns-nodue",
      status: "not_started",
      due_date: null,
    });

    const input = [nsNoDue, nsOntime, ipOverdue, nsOverdue, ipOntime];
    const { nextStep, others } = selectNextStep(input, NOW);

    expect(nextStep?.id).toBe("ip-ontime");
    expect(others.map((a) => a.id)).toEqual([
      "ip-overdue",
      "ns-overdue",
      "ns-ontime",
      "ns-nodue",
    ]);
  });

  it("does not mutate the input array", () => {
    const a = makeAssignment({ id: "a", status: "not_started", due_date: FAR });
    const b = makeAssignment({
      id: "b",
      status: "in_progress",
      due_date: NEAR,
    });
    const input = [a, b];
    selectNextStep(input, NOW);
    expect(input[0].id).toBe("a");
    expect(input[1].id).toBe("b");
  });
});
