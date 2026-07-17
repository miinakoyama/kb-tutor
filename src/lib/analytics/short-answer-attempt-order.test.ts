import { describe, expect, it } from "vitest";
import {
  compareShortAnswerAttempts,
  formatShortAnswerAttemptTimestamp,
  type SortableShortAnswerAttempt,
} from "./short-answer-attempt-order";

function attempt(
  overrides: Partial<SortableShortAnswerAttempt>,
): SortableShortAnswerAttempt {
  return {
    attemptId: "00000000-0000-4000-8000-000000000001",
    studentLabel: "Alex R.",
    partLabel: "A",
    attemptNumber: 1,
    answeredAt: "2026-07-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("compareShortAnswerAttempts", () => {
  it("orders repeated runs chronologically before considering attempt number", () => {
    const olderRunAttempt2 = attempt({
      attemptId: "00000000-0000-4000-8000-000000000002",
      attemptNumber: 2,
      answeredAt: "2026-07-15T10:02:00.000Z",
    });
    const newerRunAttempt1 = attempt({
      attemptId: "00000000-0000-4000-8000-000000000003",
      attemptNumber: 1,
      answeredAt: "2026-07-16T10:00:00.000Z",
    });

    expect(
      [newerRunAttempt1, olderRunAttempt2].sort(compareShortAnswerAttempts),
    ).toEqual([olderRunAttempt2, newerRunAttempt1]);
  });

  it("uses the unique attempt id to make timestamp ties deterministic", () => {
    const laterId = attempt({
      attemptId: "00000000-0000-4000-8000-000000000002",
    });
    const earlierId = attempt({
      attemptId: "00000000-0000-4000-8000-000000000001",
    });

    expect([laterId, earlierId].sort(compareShortAnswerAttempts)).toEqual([
      earlierId,
      laterId,
    ]);
  });
});

describe("formatShortAnswerAttemptTimestamp", () => {
  it("returns a deterministic UTC label for repeated attempt numbers", () => {
    expect(formatShortAnswerAttemptTimestamp("2026-07-16T14:32:45-04:00")).toBe(
      "2026-07-16 18:32 UTC",
    );
  });
});
