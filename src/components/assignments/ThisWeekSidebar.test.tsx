import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import { ThisWeekSidebar } from "./ThisWeekSidebar";

function makeAssignment(
  overrides: Partial<StudentAssignmentListItem> = {},
): StudentAssignmentListItem {
  return {
    id: "assignment-1",
    title: "Cell Structure Review",
    due_date: null,
    topics: ["Cell Structure"],
    target_minutes: 20,
    mode: "practice",
    randomize_order: false,
    max_questions: 10,
    instructions: null,
    max_attempts: null,
    completed_attempts: 0,
    recorded_completion_count: 0,
    status: "not_started",
    last_completed_at: null,
    progress: { answered: 0, total: 10 },
    accuracy: null,
    ...overrides,
  };
}

describe("ThisWeekSidebar calendar assignment details", () => {
  afterEach(() => {
    cleanup();
  });

  it("exposes marked-day details through a keyboard and click-accessible trigger", () => {
    const now = new Date();
    const dueDate = new Date(now.getFullYear(), now.getMonth(), 15, 12);
    render(
      <ThisWeekSidebar
        assignments={[makeAssignment({ due_date: dueDate.toISOString() })]}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: /1 due, 0 completed/,
    });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const popoverId = trigger.getAttribute("aria-describedby");
    expect(popoverId).toBeTruthy();
    const popover = document.getElementById(popoverId!);
    expect(popover?.getAttribute("role")).toBe("tooltip");
    expect(popover?.textContent).toContain("Cell Structure Review");
    expect(popover?.textContent).toContain("Practice");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(popover?.className).toContain("opacity-100");

    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
