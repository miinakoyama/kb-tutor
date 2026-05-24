import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AllAssignmentsCompleteModalManager } from "./AllAssignmentsCompleteModalManager";
import {
  emitAllAssignmentsCompletedEvent,
  readStoredIncompleteAssignmentCount,
  writeStoredIncompleteAssignmentCount,
} from "@/lib/all-assignments-complete-modal";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string | null>(),
}));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

vi.mock(
  "@/components/assignments/AllAssignmentsCompleteSelfPracticeModal",
  () => ({
    AllAssignmentsCompleteSelfPracticeModal: ({
      open,
    }: {
      open: boolean;
      onDismiss: () => void;
    }) =>
      open ? (
        <div data-testid="complete-modal">all assignments complete</div>
      ) : null,
  }),
);

const STUDENT_ID = "student-123";

function mockCompletionStatus(body: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => body,
    })) as unknown as typeof fetch,
  );
}

describe("AllAssignmentsCompleteModalManager — suppression", () => {
  beforeEach(() => {
    localStorage.clear();
    usePathnameMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not open the modal on /self-practice even when the completion transition is satisfied", async () => {
    usePathnameMock.mockReturnValue("/self-practice");
    writeStoredIncompleteAssignmentCount(STUDENT_ID, 2);
    mockCompletionStatus({
      is_student: true,
      student_user_id: STUDENT_ID,
      incomplete_assignments: 0,
      total_assignments: 3,
      all_assignments_completed: true,
    });

    render(<AllAssignmentsCompleteModalManager />);

    await waitFor(() => {
      expect(readStoredIncompleteAssignmentCount(STUDENT_ID)).toBe(0);
    });
    expect(screen.queryByTestId("complete-modal")).toBeNull();
  });

  it("does not open the modal on /login or /login/staff", async () => {
    for (const path of ["/login", "/login/staff"] as const) {
      usePathnameMock.mockReturnValue(path);
      writeStoredIncompleteAssignmentCount(STUDENT_ID, 2);
      mockCompletionStatus({
        is_student: true,
        student_user_id: STUDENT_ID,
        incomplete_assignments: 0,
        total_assignments: 3,
        all_assignments_completed: true,
      });

      const { unmount } = render(<AllAssignmentsCompleteModalManager />);
      await waitFor(() => {
        expect(readStoredIncompleteAssignmentCount(STUDENT_ID)).toBe(0);
      });
      expect(screen.queryByTestId("complete-modal")).toBeNull();
      unmount();
      localStorage.clear();
    }
  });

  it("persists the latest incomplete count on suppressed paths so the modal cannot reopen later for the same completion", async () => {
    usePathnameMock.mockReturnValue("/self-practice");
    writeStoredIncompleteAssignmentCount(STUDENT_ID, 2);
    mockCompletionStatus({
      is_student: true,
      student_user_id: STUDENT_ID,
      incomplete_assignments: 0,
      total_assignments: 3,
      all_assignments_completed: true,
    });

    const { unmount } = render(<AllAssignmentsCompleteModalManager />);
    await waitFor(() => {
      expect(readStoredIncompleteAssignmentCount(STUDENT_ID)).toBe(0);
    });
    unmount();

    // Student now navigates to a non-suppressed page. previousIncomplete
    // should be 0 (not the stale 2), so shouldOpen evaluates false and
    // the modal must not re-trigger for the same completion event.
    usePathnameMock.mockReturnValue("/");
    mockCompletionStatus({
      is_student: true,
      student_user_id: STUDENT_ID,
      incomplete_assignments: 0,
      total_assignments: 3,
      all_assignments_completed: true,
    });

    render(<AllAssignmentsCompleteModalManager />);
    await waitFor(() => {
      expect(readStoredIncompleteAssignmentCount(STUDENT_ID)).toBe(0);
    });
    expect(screen.queryByTestId("complete-modal")).toBeNull();
  });

  it("opens the modal on a non-suppressed path when previousIncomplete > 0 and currentIncomplete === 0", async () => {
    usePathnameMock.mockReturnValue("/");
    writeStoredIncompleteAssignmentCount(STUDENT_ID, 2);
    mockCompletionStatus({
      is_student: true,
      student_user_id: STUDENT_ID,
      incomplete_assignments: 0,
      total_assignments: 3,
      all_assignments_completed: true,
    });

    render(<AllAssignmentsCompleteModalManager />);
    await screen.findByTestId("complete-modal");
  });

  it("does not open via the completion event when the student is on a suppressed path", async () => {
    usePathnameMock.mockReturnValue("/self-practice");
    mockCompletionStatus({
      is_student: false,
    });

    render(<AllAssignmentsCompleteModalManager />);
    // Let the initial syncFromServer settle.
    await Promise.resolve();

    emitAllAssignmentsCompletedEvent();

    // Microtask flush — the event handler is synchronous and would have
    // called setOpen(true) already if it didn't honor the suppression.
    await Promise.resolve();
    expect(screen.queryByTestId("complete-modal")).toBeNull();
  });
});
