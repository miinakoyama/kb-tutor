import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeNextShownForCurrentCompletion,
  emitAllAssignmentsCompletedEvent,
  readStoredIncompleteAssignmentCount,
  shouldOpenAllAssignmentsCompleteModal,
  subscribeToAllAssignmentsCompleted,
  writeStoredIncompleteAssignmentCount,
} from "@/lib/all-assignments-complete-modal";

describe("all-assignments-complete-modal", () => {
  const userA = "student-a";
  const userB = "student-b";

  afterEach(() => {
    localStorage.clear();
  });

  it("stores and reads incomplete count per user", () => {
    writeStoredIncompleteAssignmentCount(userA, 3);
    writeStoredIncompleteAssignmentCount(userB, 1);

    expect(readStoredIncompleteAssignmentCount(userA)).toBe(3);
    expect(readStoredIncompleteAssignmentCount(userB)).toBe(1);
  });

  it("returns null when value is missing", () => {
    expect(readStoredIncompleteAssignmentCount(userA)).toBeNull();
  });

  it("ignores invalid write input", () => {
    writeStoredIncompleteAssignmentCount(userA, -1);
    expect(readStoredIncompleteAssignmentCount(userA)).toBeNull();
  });

  it("subscribes and receives completion events", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToAllAssignmentsCompleted(listener);

    emitAllAssignmentsCompletedEvent();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    emitAllAssignmentsCompletedEvent();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("opens only on >0 -> 0 transition with valid completion signal", () => {
    expect(
      shouldOpenAllAssignmentsCompleteModal({
        previousIncomplete: 2,
        currentIncomplete: 0,
        totalAssignments: 2,
        allAssignmentsCompleted: true,
        alreadyShownForCurrentCompletion: false,
      }),
    ).toBe(true);
  });

  it("does not open when already shown for the current completion", () => {
    expect(
      shouldOpenAllAssignmentsCompleteModal({
        previousIncomplete: 2,
        currentIncomplete: 0,
        totalAssignments: 2,
        allAssignmentsCompleted: true,
        alreadyShownForCurrentCompletion: true,
      }),
    ).toBe(false);
  });

  it("does not open when total assignments is zero even if incomplete is zero", () => {
    expect(
      shouldOpenAllAssignmentsCompleteModal({
        previousIncomplete: 1,
        currentIncomplete: 0,
        totalAssignments: 0,
        allAssignmentsCompleted: false,
        alreadyShownForCurrentCompletion: false,
      }),
    ).toBe(false);
  });

  it("keeps shown=true while still complete and resets only when incomplete reappears", () => {
    const stillComplete = computeNextShownForCurrentCompletion({
      currentIncomplete: 0,
      alreadyShownForCurrentCompletion: true,
      openedModalNow: false,
    });
    expect(stillComplete).toBe(true);

    const backToIncomplete = computeNextShownForCurrentCompletion({
      currentIncomplete: 1,
      alreadyShownForCurrentCompletion: true,
      openedModalNow: false,
    });
    expect(backToIncomplete).toBe(false);
  });
});
