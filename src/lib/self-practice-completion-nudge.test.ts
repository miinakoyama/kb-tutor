import { afterEach, describe, expect, it } from "vitest";
import {
  ALL_ASSIGNMENTS_COMPLETE_NUDGE_DISMISSED_KEY,
  dismissAllAssignmentsCompleteNudge,
  readAllAssignmentsCompleteNudgeDismissed,
} from "@/lib/self-practice-completion-nudge";

describe("self-practice-completion-nudge", () => {
  afterEach(() => {
    localStorage.removeItem(ALL_ASSIGNMENTS_COMPLETE_NUDGE_DISMISSED_KEY);
  });

  it("read returns false when key is absent", () => {
    expect(readAllAssignmentsCompleteNudgeDismissed()).toBe(false);
  });

  it("dismiss persists and read returns true", () => {
    dismissAllAssignmentsCompleteNudge();
    expect(readAllAssignmentsCompleteNudgeDismissed()).toBe(true);
  });
});
