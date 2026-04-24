import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emitAllAssignmentsCompletedEvent,
  readStoredIncompleteAssignmentCount,
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
});
