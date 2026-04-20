import { beforeEach, describe, expect, it, vi } from "vitest";

// Sync-queue needs to be importable without real Supabase env. The functions
// that hit the network bail early when `canUseRemoteDb()` is false, which
// happens in the test environment (no NEXT_PUBLIC_SUPABASE_* vars). So we
// test the pure-queue behavior here (dedupe, persistence, status).

import {
  __testing,
  enqueueAttempt,
  enqueueBookmark,
  getPendingCount,
  getSyncStatus,
  subscribeSyncStatus,
  type SyncStatus,
} from "./sync-queue";

beforeEach(() => {
  localStorage.clear();
  __testing.resetListeners();
  __testing.writeQueue([]);
});

describe("sync-queue", () => {
  it("enqueues an attempt and persists it to localStorage", () => {
    enqueueAttempt({
      clientAttemptId: "attempt-1",
      questionId: "q1",
      selectedOptionId: "A",
      isCorrect: true,
      mode: "practice",
      answeredAt: new Date().toISOString(),
    });
    const queue = __testing.readQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].kind).toBe("attempt");
    expect(getPendingCount()).toBe(1);
  });

  it("collapses repeated bookmark ops for the same question into the latest", () => {
    enqueueBookmark({ questionId: "q1", enabled: true });
    enqueueBookmark({ questionId: "q1", enabled: false });
    enqueueBookmark({ questionId: "q1", enabled: true });
    const queue = __testing.readQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].kind).toBe("bookmark");
    if (queue[0].kind === "bookmark") {
      expect(queue[0].payload.enabled).toBe(true);
    }
  });

  it("keeps separate entries for different question bookmarks", () => {
    enqueueBookmark({ questionId: "q1", enabled: true });
    enqueueBookmark({ questionId: "q2", enabled: false });
    expect(__testing.readQueue()).toHaveLength(2);
  });

  it("broadcasts a non-idle status when enqueueing", () => {
    const fn = vi.fn<(s: SyncStatus) => void>();
    subscribeSyncStatus(fn);
    fn.mockClear();
    enqueueAttempt({
      clientAttemptId: "attempt-1",
      questionId: "q1",
      selectedOptionId: "A",
      isCorrect: true,
      mode: "practice",
      answeredAt: new Date().toISOString(),
    });
    expect(fn).toHaveBeenCalled();
    const lastCall = fn.mock.calls.at(-1);
    expect(lastCall?.[0].kind).not.toBe("idle");
  });

  it("getSyncStatus reflects an empty queue as idle initially", () => {
    expect(getSyncStatus().kind).toBe("idle");
  });
});
