/**
 * Durable write queue for student-generated data (answer attempts, bookmarks).
 *
 * Design goals:
 *  - Never lose an answer/bookmark change, even across tab reloads or temporary
 *    network outages. We persist the queue to `localStorage` so pending writes
 *    survive a refresh or crash.
 *  - Make retries idempotent. Each queued attempt carries a client-generated
 *    UUID (`clientAttemptId`); the server dedupes via a unique index. Bookmark
 *    ops collapse to "desired state per questionId".
 *  - Surface sync status to the UI without forcing callers to await. Listeners
 *    receive `{ queuedCount, lastStatus }` via a tiny pub/sub.
 *
 * This module is browser-only. It no-ops on the server.
 */
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";

const QUEUE_STORAGE_KEY = "kb-tutor-sync-queue-v1";

// Toggle with `localStorage.setItem("kb-tutor-sync-debug", "1")` in the
// console. Kept off by default to avoid noise in production.
function debugLog(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem("kb-tutor-sync-debug") === "1") {
      // eslint-disable-next-line no-console
      console.log("[sync]", ...args);
    }
  } catch {
    // ignore
  }
}

const MAX_TRIES = 8;
const BACKOFF_MS = [0, 1_000, 3_000, 8_000, 20_000, 45_000, 120_000, 300_000];
const SAVED_FLASH_MS = 1_800;
// Upper bound for any single write. If a request hangs (common after a brief
// offline period where the TCP connection never recovers), we abort and retry
// rather than lock up the queue forever. Kept tight so we don't stall behind
// one stuck socket when we have a live network.
const REQUEST_TIMEOUT_MS = 10_000;

export type AttemptPayload = {
  clientAttemptId: string;
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  mode: string;
  module?: number | null;
  topic?: string | null;
  standardId?: string | null;
  standardLabel?: string | null;
  timeSpentSec?: number | null;
  assignmentId?: string | null;
  answeredAt: string; // ISO
};

export type BookmarkOp = {
  questionId: string;
  enabled: boolean;
};

type PendingWrite =
  | {
      id: string;
      kind: "attempt";
      payload: AttemptPayload;
      tries: number;
      createdAt: number;
      nextAttemptAt: number;
      lastError?: string;
    }
  | {
      id: string;
      kind: "bookmark";
      payload: BookmarkOp;
      tries: number;
      createdAt: number;
      nextAttemptAt: number;
      lastError?: string;
    };

export type SyncStatus =
  | { kind: "idle" }
  | { kind: "saving"; queuedCount: number }
  | { kind: "saved" }
  | { kind: "offline"; queuedCount: number }
  | { kind: "retrying"; queuedCount: number }
  | { kind: "failed"; queuedCount: number };

type Listener = (status: SyncStatus) => void;

const listeners = new Set<Listener>();
let lastBroadcast: SyncStatus = { kind: "idle" };
let savedFlashTimer: ReturnType<typeof setTimeout> | null = null;
let processingPromise: Promise<void> | null = null;
let scheduledFlushTimer: ReturnType<typeof setTimeout> | null = null;

// Active in-flight operations. We don't rely on Supabase's `.abortSignal()`
// propagating cleanly (some versions swallow the error), so instead we
// race each fetch against a manual timer. `forceRejectAll` lets outside
// events (e.g. browser `online`) unblock stuck fetches right away.
//
// We process writes in parallel (see `processQueue`), so there can be
// several waits outstanding at once — hence a Set instead of a single ref.
const activeWaits = new Set<{ forceReject: (reason: Error) => void }>();

function abortInFlightRequest(): void {
  if (activeWaits.size === 0) return;
  const pending = Array.from(activeWaits);
  activeWaits.clear();
  for (const w of pending) {
    w.forceReject(new Error("Cancelled by lifecycle event"));
  }
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function canUseRemoteDb(): boolean {
  return isBrowser() && hasSupabaseEnv();
}

function readQueue(): PendingWrite[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PendingWrite[];
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingWrite[]): void {
  if (!isBrowser()) return;
  try {
    if (queue.length === 0) {
      window.localStorage.removeItem(QUEUE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    }
  } catch {
    // storage full — drop silently; data is still in LS under answer-history
  }
}

function broadcast(status: SyncStatus) {
  lastBroadcast = status;
  for (const fn of listeners) {
    try {
      fn(status);
    } catch {
      // ignore listener errors
    }
  }
}

function recomputeStatus(): SyncStatus {
  const queue = readQueue();
  if (queue.length === 0) return { kind: "idle" };
  const online = isBrowser() ? navigator.onLine : true;
  if (!online) return { kind: "offline", queuedCount: queue.length };
  const anyFailed = queue.some((w) => w.tries >= MAX_TRIES);
  if (anyFailed) return { kind: "failed", queuedCount: queue.length };
  const anyRetrying = queue.some((w) => w.tries > 0);
  if (anyRetrying) return { kind: "retrying", queuedCount: queue.length };
  return { kind: "saving", queuedCount: queue.length };
}

function flashSaved() {
  if (savedFlashTimer) clearTimeout(savedFlashTimer);
  broadcast({ kind: "saved" });
  savedFlashTimer = setTimeout(() => {
    const next = recomputeStatus();
    broadcast(next);
  }, SAVED_FLASH_MS);
}

export function getSyncStatus(): SyncStatus {
  return lastBroadcast;
}

export function subscribeSyncStatus(fn: Listener): () => void {
  listeners.add(fn);
  fn(lastBroadcast);
  return () => {
    listeners.delete(fn);
  };
}

function generateId(): string {
  if (isBrowser() && typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function dedupeBookmarks(queue: PendingWrite[], op: BookmarkOp): PendingWrite[] {
  // Collapse repeated add/remove ops for the same question into the latest.
  return queue.filter((w) => !(w.kind === "bookmark" && w.payload.questionId === op.questionId));
}

function enqueue(entry: PendingWrite) {
  const existing = readQueue();
  let next: PendingWrite[];
  if (entry.kind === "bookmark") {
    next = [...dedupeBookmarks(existing, entry.payload), entry];
  } else {
    next = [...existing, entry];
  }
  writeQueue(next);
  broadcast(recomputeStatus());
}

export function enqueueAttempt(payload: AttemptPayload): void {
  enqueue({
    id: generateId(),
    kind: "attempt",
    payload,
    tries: 0,
    createdAt: Date.now(),
    nextAttemptAt: Date.now(),
  });
  void processQueue();
}

export function enqueueAttempts(payloads: AttemptPayload[]): void {
  if (payloads.length === 0) return;
  const existing = readQueue();
  const additions: PendingWrite[] = payloads.map((payload) => ({
    id: generateId(),
    kind: "attempt",
    payload,
    tries: 0,
    createdAt: Date.now(),
    nextAttemptAt: Date.now(),
  }));
  writeQueue([...existing, ...additions]);
  broadcast(recomputeStatus());
  void processQueue();
}

export function enqueueBookmark(op: BookmarkOp): void {
  enqueue({
    id: generateId(),
    kind: "bookmark",
    payload: op,
    tries: 0,
    createdAt: Date.now(),
    nextAttemptAt: Date.now(),
  });
  void processQueue();
}

/**
 * Runs `work` against a hard deadline. If the timer wins, we throw — the caller
 * treats that as a retriable failure. The underlying fetch may continue in the
 * background; that's harmless because retries are idempotent via
 * `client_attempt_id` / bookmark question_id.
 *
 * `abortInFlightRequest()` can force-reject this race early (e.g. when the
 * browser reports `online` while a stale socket is still hung).
 */
async function withTimeout<T>(work: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const wait: { forceReject: (reason: Error) => void } = {
      forceReject: (reason) => {
        cleanup();
        reject(reason);
      },
    };
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeWaits.delete(wait);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    activeWaits.add(wait);
    work()
      .then((value) => {
        if (settled) return;
        cleanup();
        resolve(value);
      })
      .catch((err: unknown) => {
        if (settled) return;
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

async function refreshSupabaseSession(): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    await withTimeout(
      async () => {
        await supabase.auth.getSession();
      },
      REQUEST_TIMEOUT_MS,
    );
  } catch {
    // ignore: if refresh fails we'll still attempt the queue; upsert failures
    // will be surfaced through the normal retry path.
  }
}

async function runAttempt(entry: Extract<PendingWrite, { kind: "attempt" }>): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const row = {
    client_attempt_id: entry.payload.clientAttemptId,
    question_id: entry.payload.questionId,
    selected_option_id: entry.payload.selectedOptionId,
    is_correct: entry.payload.isCorrect,
    mode: entry.payload.mode,
    module: entry.payload.module ?? null,
    topic: entry.payload.topic ?? null,
    standard_id: entry.payload.standardId ?? null,
    standard_label: entry.payload.standardLabel ?? null,
    time_spent_sec: entry.payload.timeSpentSec ?? null,
    assignment_id: entry.payload.assignmentId ?? null,
    answered_at: entry.payload.answeredAt,
  };
  const { error } = await withTimeout(
    async () =>
      await supabase
        .from("attempts")
        .upsert(row, { onConflict: "client_attempt_id", ignoreDuplicates: true }),
    REQUEST_TIMEOUT_MS,
  );
  if (error) throw new Error(error.message);
}

async function runBookmark(entry: Extract<PendingWrite, { kind: "bookmark" }>): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (entry.payload.enabled) {
    const { error } = await withTimeout(
      async () =>
        await supabase.from("bookmarks").upsert({ question_id: entry.payload.questionId }),
      REQUEST_TIMEOUT_MS,
    );
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await withTimeout(
    async () =>
      await supabase.from("bookmarks").delete().eq("question_id", entry.payload.questionId),
    REQUEST_TIMEOUT_MS,
  );
  if (error) throw new Error(error.message);
}

function scheduleNextFlush(delayMs: number) {
  if (!isBrowser()) return;
  if (scheduledFlushTimer) clearTimeout(scheduledFlushTimer);
  scheduledFlushTimer = setTimeout(() => {
    scheduledFlushTimer = null;
    void processQueue();
  }, Math.max(50, delayMs));
}

export function processQueue(): Promise<void> {
  if (processingPromise) {
    debugLog("processQueue: already processing, returning existing promise");
    return processingPromise;
  }
  debugLog("processQueue: starting");
  processingPromise = (async () => {
    try {
      if (!canUseRemoteDb()) {
        debugLog("processQueue: canUseRemoteDb=false, exiting");
        return;
      }

      // Loop: after each batch we re-read LS so items enqueued *during*
      // processing (e.g. the user answered another question while we were
      // awaiting a fetch) are picked up in the same run. Without this, the
      // `processingPromise` lock would swallow those calls and nothing would
      // ever process them until the next lifecycle event.
      let completedAny = false;
      for (;;) {
        const queue = readQueue();
        if (queue.length === 0) {
          debugLog("processQueue: queue drained");
          if (completedAny) flashSaved();
          else broadcast({ kind: "idle" });
          return;
        }

        broadcast(recomputeStatus());

        const now = Date.now();
        const due = queue.filter((w) => w.nextAttemptAt <= now);
        if (due.length === 0) {
          const nextAt = Math.min(...queue.map((w) => w.nextAttemptAt));
          debugLog("processQueue: nothing due, scheduling in", nextAt - now, "ms");
          scheduleNextFlush(nextAt - now);
          return;
        }
        debugLog("processQueue: firing", due.length, "items in parallel");

        // Fire all due writes in parallel. If the browser comes back from
        // an offline stretch and the first socket is stale, sequential
        // processing would stall on that one request (up to
        // REQUEST_TIMEOUT_MS) and block every item behind it. Running in
        // parallel lets the other sockets make progress — and the queue is
        // idempotent, so there's no correctness cost to firing them
        // concurrently.
        const startedAt = Date.now();
        const results = await Promise.allSettled(
          due.map(async (entry) => {
            if (entry.kind === "attempt") await runAttempt(entry);
            else await runBookmark(entry);
          }),
        );
        debugLog(
          "processQueue: allSettled done in",
          Date.now() - startedAt,
          "ms",
          results.map((r) => r.status),
        );

        let anyFailure = false;
        for (let i = 0; i < due.length; i++) {
          const entry = due[i];
          const result = results[i];
          if (result.status === "fulfilled") {
            const current = readQueue().filter((w) => w.id !== entry.id);
            writeQueue(current);
            completedAny = true;
            continue;
          }
          anyFailure = true;
          // Failure path. Base the retry count on whatever is in LS right
          // now, not on the in-memory snapshot — the `online` handler may
          // have reset tries to zero while we were in flight, and we don't
          // want to clobber that.
          const err = result.reason;
          const latest = readQueue().find((w) => w.id === entry.id);
          if (!latest) continue;
          const tries = latest.tries + 1;
          const backoff = BACKOFF_MS[Math.min(tries, BACKOFF_MS.length - 1)];
          const updated: PendingWrite = {
            ...latest,
            tries,
            nextAttemptAt: Date.now() + backoff,
            lastError: err instanceof Error ? err.message : String(err),
          };
          const current = readQueue().map((w) => (w.id === entry.id ? updated : w));
          writeQueue(current);
        }
        broadcast(recomputeStatus());

        // If any item failed, don't tight-loop — wait for backoff. Otherwise
        // re-check for newly-due items right away, because we may have
        // picked up additional enqueues while awaiting the last batch.
        if (anyFailure) {
          const remaining = readQueue();
          if (remaining.length === 0) {
            if (completedAny) flashSaved();
            else broadcast({ kind: "idle" });
            return;
          }
          const nextAt = Math.min(...remaining.map((w) => w.nextAttemptAt));
          scheduleNextFlush(nextAt - Date.now());
          return;
        }
        // Success path: loop back and drain anything added while we waited.
      }
    } finally {
      processingPromise = null;
      debugLog("processQueue: done, processingPromise cleared");
    }
  })();
  return processingPromise;
}

/**
 * Reset backoff on every queued item so they become immediately due. Used
 * both for manual retry and when the browser reconnects — otherwise a long
 * backoff (e.g. 45s–2min after a string of offline failures) keeps the
 * indicator spinning even after the network has come back.
 *
 * `resetTries=true` also wipes the failure counter so the next retry is
 * treated as a fresh attempt ("Saving" instead of "Retrying").
 */
function resetBackoff({ resetTries }: { resetTries: boolean }): void {
  const now = Date.now();
  const queue = readQueue().map((w) => ({
    ...w,
    tries: resetTries ? 0 : w.tries,
    nextAttemptAt: now,
  }));
  writeQueue(queue);
}

/** Manual retry (user clicks "Retry" button). */
export function retryAllPending(): Promise<void> {
  resetBackoff({ resetTries: false });
  broadcast(recomputeStatus());
  return processQueue();
}

export function getPendingCount(): number {
  return readQueue().length;
}

let lifecycleInstalled = false;
/** Install online/visibility listeners + initial flush. Safe to call many times. */
export function installSyncLifecycle(): void {
  if (!isBrowser() || lifecycleInstalled) return;
  lifecycleInstalled = true;
  broadcast(recomputeStatus());
  window.addEventListener("online", () => {
    debugLog("event: online fired, navigator.onLine=", navigator.onLine);
    // A stale TCP connection often keeps a prior fetch hung even after the OS
    // reports "online". Abort it so the queue can move forward immediately.
    abortInFlightRequest();
    // Failures that happened while offline pushed `nextAttemptAt` tens of
    // seconds into the future. Flatten everything so the UI doesn't sit on
    // "Retrying…" waiting for a stale backoff to expire.
    resetBackoff({ resetTries: true });
    if (scheduledFlushTimer) {
      clearTimeout(scheduledFlushTimer);
      scheduledFlushTimer = null;
    }
    broadcast(recomputeStatus());
    // Auth tokens can expire silently while the tab was offline. Proactively
    // refresh the Supabase session so the first flush doesn't get 401'd
    // and end up in the retry loop. We don't await — the queue should start
    // moving immediately either way, since refresh is idempotent.
    void refreshSupabaseSession();
    void processQueue();
  });
  window.addEventListener("offline", () => {
    debugLog("event: offline fired");
    broadcast(recomputeStatus());
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      debugLog("event: visibility=visible");
      resetBackoff({ resetTries: false });
      if (scheduledFlushTimer) {
        clearTimeout(scheduledFlushTimer);
        scheduledFlushTimer = null;
      }
      void processQueue();
    }
  });
  // Kick off any pending writes that survived a refresh.
  void processQueue();
}

/** Test-only helpers */
export const __testing = {
  readQueue,
  writeQueue,
  resetListeners: () => {
    listeners.clear();
    lastBroadcast = { kind: "idle" };
    if (savedFlashTimer) {
      clearTimeout(savedFlashTimer);
      savedFlashTimer = null;
    }
    if (scheduledFlushTimer) {
      clearTimeout(scheduledFlushTimer);
      scheduledFlushTimer = null;
    }
  },
};
