import { beforeEach, describe, expect, it, vi } from "vitest";

// Sync-queue needs to be importable without real Supabase env. The functions
// that hit the network bail early when `canUseRemoteDb()` is false, which
// happens in the test environment (no NEXT_PUBLIC_SUPABASE_* vars). So we
// test the pure-queue behavior here (dedupe, persistence, status).

import {
  __testing,
  discardFailedPending,
  enqueueAttempt,
  enqueueBookmark,
  getPendingCount,
  getSyncStatus,
  processQueue,
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

describe("isNonRetriableError", () => {
  const { isNonRetriableError, SyncWriteError } = __testing;

  function makeErr(code: string | null): InstanceType<typeof SyncWriteError> {
    return new SyncWriteError({ message: "boom", code, details: null, constraint: null });
  }

  it("treats FK/check/not-null/shape Postgres codes as permanent", () => {
    for (const code of ["23503", "23514", "23502", "22P02", "42P10", "42703", "42P01"]) {
      expect(isNonRetriableError(makeErr(code))).toBe(true);
    }
  });

  it("treats any PGRST* code as permanent (PostgREST shape error)", () => {
    expect(isNonRetriableError(makeErr("PGRST116"))).toBe(true);
    expect(isNonRetriableError(makeErr("PGRST204"))).toBe(true);
  });

  it("lets transient errors through the retry loop", () => {
    // Network/timeouts/5xx have no code or a non-blocklisted one.
    expect(isNonRetriableError(makeErr(null))).toBe(false);
    expect(isNonRetriableError(makeErr("08006"))).toBe(false); // connection_failure
    expect(isNonRetriableError(new Error("Network error"))).toBe(false);
    expect(isNonRetriableError("not even an error")).toBe(false);
  });
});

describe("processQueue watchdog", () => {
  it("force-releases a stuck lock and starts a fresh run", async () => {
    // Rig the lock with a promise that will never resolve and a timestamp
    // older than PROCESSING_STUCK_MS. Simulates the wedged-supabase-client
    // scenario we saw in production.
    const neverResolves = new Promise<void>(() => {});
    const staleStartedAt = Date.now() - __testing.PROCESSING_STUCK_MS - 1_000;
    __testing.setLock(neverResolves, staleStartedAt);

    // This should NOT await the stuck promise. Instead, the watchdog
    // releases it and returns a fresh, resolving one. (In this test env
    // `canUseRemoteDb()` is false, so the fresh run exits immediately.)
    const fresh = processQueue();
    await expect(fresh).resolves.toBeUndefined();
    expect(fresh).not.toBe(neverResolves);
  });

  it("reuses the in-flight promise when the existing lock is still young", () => {
    // A not-yet-stale lock means processQueue should short-circuit and
    // return the existing promise rather than starting a second concurrent
    // drain.
    const inFlight = new Promise<void>(() => {});
    __testing.setLock(inFlight, Date.now());
    expect(processQueue()).toBe(inFlight);
  });
});

describe("discardFailedPending", () => {
  it("drops only items that hit MAX_TRIES and reports the count", () => {
    // Seed the queue directly via __testing so we can set `tries` without
    // having to mock a failing network. MAX_TRIES is 8.
    __testing.writeQueue([
      {
        id: "a",
        kind: "attempt",
        payload: {
          clientAttemptId: "a",
          questionId: "q1",
          selectedOptionId: "A",
          isCorrect: true,
          mode: "practice",
          answeredAt: new Date().toISOString(),
        },
        tries: 8, // failed
        createdAt: Date.now(),
        nextAttemptAt: Date.now(),
      },
      {
        id: "b",
        kind: "attempt",
        payload: {
          clientAttemptId: "b",
          questionId: "q2",
          selectedOptionId: "B",
          isCorrect: true,
          mode: "practice",
          answeredAt: new Date().toISOString(),
        },
        tries: 3, // still retrying
        createdAt: Date.now(),
        nextAttemptAt: Date.now(),
      },
    ]);

    expect(discardFailedPending()).toBe(1);
    const remaining = __testing.readQueue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("b");
    // Idempotent — no further failures to drop.
    expect(discardFailedPending()).toBe(0);
  });
});
