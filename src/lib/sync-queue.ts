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
import { getSupabaseBrowserClient, resetSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";

const QUEUE_STORAGE_KEY = "kb-tutor-sync-queue-v1";

// Toggle with `localStorage.setItem("kb-tutor-sync-debug", "1")` in the
// console. Kept off by default to avoid noise in production.
function debugLog(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem("kb-tutor-sync-debug") === "1") {
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
// When we started the currently-running processQueue. Used as a watchdog so
// a previous call that somehow never reaches its `finally` (e.g. a deep
// supabase-js promise chain that stops settling after an offline period)
// can't block all future flushes forever.
let processingStartedAt = 0;
const PROCESSING_STUCK_MS = 30_000;
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

/**
 * Build a fresh pending entry. Centralized so every enqueue path stamps the
 * same defaults (tries=0, immediately due, fresh UUID) — diverging on those
 * has caused sneaky bugs before (e.g. an entry enqueued with a future
 * `nextAttemptAt` that never fired).
 */
function makeEntry<K extends PendingWrite["kind"]>(
  kind: K,
  payload: Extract<PendingWrite, { kind: K }>["payload"],
): Extract<PendingWrite, { kind: K }> {
  const now = Date.now();
  return {
    id: generateId(),
    kind,
    payload,
    tries: 0,
    createdAt: now,
    nextAttemptAt: now,
  } as Extract<PendingWrite, { kind: K }>;
}

function enqueue(entry: PendingWrite) {
  const existing = readQueue();
  const next: PendingWrite[] =
    entry.kind === "bookmark"
      ? [...dedupeBookmarks(existing, entry.payload), entry]
      : [...existing, entry];
  writeQueue(next);
  broadcast(recomputeStatus());
}

export function enqueueAttempt(payload: AttemptPayload): void {
  enqueue(makeEntry("attempt", payload));
  void processQueue();
}

export function enqueueAttempts(payloads: AttemptPayload[]): void {
  if (payloads.length === 0) return;
  // Batched write so we don't pay N broadcasts + N localStorage writes.
  const additions = payloads.map((p) => makeEntry("attempt", p));
  writeQueue([...readQueue(), ...additions]);
  broadcast(recomputeStatus());
  void processQueue();
}

export function enqueueBookmark(op: BookmarkOp): void {
  enqueue(makeEntry("bookmark", op));
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

/**
 * Hit the server to reconcile supabase-js's cached auth state. `getUser()`
 * (as opposed to `getSession()`) actually validates the token over the wire
 * and, if needed, triggers a refresh. Running it here prevents the queue
 * from racing the first post-reconnect fetch against a silent 401.
 */
async function refreshSupabaseSession(): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    await withTimeout(
      async () => {
        await supabase.auth.getUser();
      },
      REQUEST_TIMEOUT_MS,
    );
  } catch {
    // ignore: if refresh fails we'll still attempt the queue; upsert failures
    // will be surfaced through the normal retry path.
  }
}

/**
 * Lifecycle-wake handler: we've just received a signal that the environment
 * has changed (browser reported `online`, tab became visible). Do what a
 * full page reload would do for the sync subsystem, then flush:
 *   1. Abort any stale in-flight waits so the queue can move immediately.
 *   2. Drop the supabase-js singleton. Offline stretches can leave its
 *      internal auth state wedged (failed refresh-token attempts, half-dead
 *      sockets), and rebuilding the client is the only thing short of a
 *      page reload that reliably resets it.
 *   3. Flatten backoff so every queued write is immediately due.
 *   4. Await a session check so subsequent upserts don't race a 401.
 *   5. Process the queue.
 */
async function wakeAndFlush(): Promise<void> {
  abortInFlightRequest();
  resetSupabaseBrowserClient();
  // Forcibly release the processing lock. Without this, if a previous run
  // got wedged inside supabase-js (e.g. a promise chain that never settles
  // after a flaky offline period), `await processQueue()` below would just
  // return that stuck promise and do nothing — exactly the "stuck on Still
  // saving, Retry button does nothing" scenario.
  processingPromise = null;
  processingStartedAt = 0;
  resetBackoff({ resetTries: true });
  if (scheduledFlushTimer) {
    clearTimeout(scheduledFlushTimer);
    scheduledFlushTimer = null;
  }
  broadcast(recomputeStatus());
  await refreshSupabaseSession();
  await processQueue();
}

/**
 * Structured Postgres error thrown by `runAttempt`/`runBookmark` so the
 * outer retry loop can distinguish "transient" (timeout, 5xx, network) from
 * "permanent" (constraint violation) failures. We preserve `code` so callers
 * can branch on it, and `message` stays human-readable for the diagnostic
 * console.
 */
class SyncWriteError extends Error {
  code: string | null;
  details: string | null;
  constraint: string | null;
  constructor(params: {
    message: string;
    code: string | null;
    details: string | null;
    constraint: string | null;
  }) {
    super(params.message);
    this.name = "SyncWriteError";
    this.code = params.code;
    this.details = params.details;
    this.constraint = params.constraint;
  }
}

// Supabase's PostgrestError has `{ code, message, details, hint }`. We widen
// the type to avoid importing the type just for this one shape.
function toSyncError(err: unknown): SyncWriteError {
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const code = typeof o.code === "string" ? o.code : null;
    const message = typeof o.message === "string" ? o.message : String(err);
    const details = typeof o.details === "string" ? o.details : null;
    // Postgres FK errors put the constraint name in the message, e.g.
    // `violates foreign key constraint "attempts_assignment_id_fkey"`.
    const m = /constraint\s+"([^"]+)"/i.exec(message);
    const constraint = m ? m[1] : null;
    return new SyncWriteError({ message, code, details, constraint });
  }
  return new SyncWriteError({
    message: err instanceof Error ? err.message : String(err),
    code: null,
    details: null,
    constraint: null,
  });
}

/**
 * Error codes where no amount of retrying will help: the request is shaped
 * wrong or references something that doesn't exist. Keep these rare so we
 * don't silently swallow server regressions; everything else stays in the
 * retry loop.
 *
 * - 23503: foreign_key_violation (e.g. stale assignment_id)
 * - 23514: check_violation
 * - 23502: not_null_violation
 * - 22P02: invalid_text_representation (malformed input)
 * - 42P10: on-conflict column mismatch (schema/drift)
 * - 42703: undefined_column
 * - PGRST116/PGRST204/etc are PostgREST shape errors; also hopeless on retry
 */
const NON_RETRIABLE_CODES = new Set<string>([
  "23503",
  "23514",
  "23502",
  "22P02",
  "42P10",
  "42703",
  "42P01",
]);

function isNonRetriableError(err: unknown): boolean {
  if (err instanceof SyncWriteError && err.code) {
    if (NON_RETRIABLE_CODES.has(err.code)) return true;
    if (err.code.startsWith("PGRST")) return true;
  }
  return false;
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
  if (!error) return;
  const syncErr = toSyncError(error);
  // Self-heal for stale assignment references: the FK is ON DELETE SET NULL
  // at the DB level for existing rows, but the client queue keeps submitting
  // with the original id. If the assignment has been deleted (or never
  // reached this environment, e.g. data copied from another project), we
  // drop the assignment_id so the answer itself still lands.
  if (
    syncErr.code === "23503" &&
    syncErr.constraint === "attempts_assignment_id_fkey" &&
    row.assignment_id != null
  ) {
    debugLog("runAttempt: nulling stale assignment_id and retrying", row.assignment_id);
    const { error: retryErr } = await withTimeout(
      async () =>
        await supabase
          .from("attempts")
          .upsert(
            { ...row, assignment_id: null },
            { onConflict: "client_attempt_id", ignoreDuplicates: true },
          ),
      REQUEST_TIMEOUT_MS,
    );
    if (!retryErr) return;
    throw toSyncError(retryErr);
  }
  throw syncErr;
}

async function runBookmark(entry: Extract<PendingWrite, { kind: "bookmark" }>): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (entry.payload.enabled) {
    const { error } = await withTimeout(
      async () =>
        await supabase.from("bookmarks").upsert({ question_id: entry.payload.questionId }),
      REQUEST_TIMEOUT_MS,
    );
    if (error) throw toSyncError(error);
    return;
  }
  const { error } = await withTimeout(
    async () =>
      await supabase.from("bookmarks").delete().eq("question_id", entry.payload.questionId),
    REQUEST_TIMEOUT_MS,
  );
  if (error) throw toSyncError(error);
}

function scheduleNextFlush(delayMs: number) {
  if (!isBrowser()) return;
  if (scheduledFlushTimer) clearTimeout(scheduledFlushTimer);
  scheduledFlushTimer = setTimeout(() => {
    scheduledFlushTimer = null;
    void processQueue();
  }, Math.max(50, delayMs));
}

async function runQueueLoop(): Promise<void> {
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

    // Fire all due writes in parallel. If the browser comes back from an
    // offline stretch and the first socket is stale, sequential processing
    // would stall on that one request (up to REQUEST_TIMEOUT_MS) and block
    // every item behind it. Running in parallel lets the other sockets make
    // progress — and the queue is idempotent, so there's no correctness
    // cost to firing them concurrently.
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

    const anyFailure = applyBatchResults(due, results);
    broadcast(recomputeStatus());
    if (anyFailure) break;
    // Success path: loop back and drain anything added while we waited.
    completedAny = true;
  }

  // Post-failure cleanup. If nothing is left (everything ended up discarded
  // as permanent before it got here), emit the terminal status; otherwise
  // schedule the next flush based on the soonest-due item.
  const remaining = readQueue();
  if (remaining.length === 0) {
    if (completedAny) flashSaved();
    else broadcast({ kind: "idle" });
    return;
  }
  const nextAt = Math.min(...remaining.map((w) => w.nextAttemptAt));
  scheduleNextFlush(nextAt - Date.now());
}

/**
 * Reconcile a batch's results back into the persisted queue. Returns
 * whether any item failed so the caller can decide whether to keep
 * looping or break out to a backoff-scheduled retry.
 *
 * We re-read LS inside each branch rather than mutating the snapshot
 * `due` because a concurrent `online`/retry handler may have reset
 * `tries` while we were in flight, and we don't want to clobber that.
 */
function applyBatchResults(
  due: PendingWrite[],
  results: PromiseSettledResult<void>[],
): boolean {
  let anyFailure = false;
  for (let i = 0; i < due.length; i++) {
    const entry = due[i];
    const result = results[i];
    if (result.status === "fulfilled") {
      writeQueue(readQueue().filter((w) => w.id !== entry.id));
      continue;
    }
    anyFailure = true;
    const err = result.reason;
    const latest = readQueue().find((w) => w.id === entry.id);
    if (!latest) continue;
    // Permanent errors (FK violation, check constraint, schema drift) never
    // recover with more attempts. Burn the retry budget so the UI promotes
    // them to "failed" immediately and the user can see that something
    // actually needs attention — instead of spinning "Retrying…" for ~8
    // minutes.
    const permanent = isNonRetriableError(err);
    const tries = permanent ? MAX_TRIES : latest.tries + 1;
    const backoff = permanent ? 0 : BACKOFF_MS[Math.min(tries, BACKOFF_MS.length - 1)];
    const message = err instanceof Error ? err.message : String(err);
    if (permanent) {
      debugLog("processQueue: permanent failure, not retrying", message);
    }
    const updated: PendingWrite = {
      ...latest,
      tries,
      nextAttemptAt: Date.now() + backoff,
      lastError: permanent ? `[non-retriable] ${message}` : message,
    };
    writeQueue(readQueue().map((w) => (w.id === entry.id ? updated : w)));
  }
  return anyFailure;
}

export function processQueue(): Promise<void> {
  if (processingPromise) {
    const age = Date.now() - processingStartedAt;
    if (age < PROCESSING_STUCK_MS) {
      debugLog("processQueue: already processing, returning existing promise");
      return processingPromise;
    }
    // Watchdog: the previous run has been in flight longer than any
    // legitimate batch should take. Assume the lock is wedged (we've seen
    // this when supabase-js's internal refresh pipeline stops settling
    // after the browser has been offline) and force-release it. The
    // orphaned promise, if it ever resolves, can't interfere because the
    // `finally` below identity-checks against the current lock holder.
    debugLog("processQueue: stuck lock detected, forcing release", age, "ms");
    processingPromise = null;
  }
  debugLog("processQueue: starting");
  processingStartedAt = Date.now();
  const p: Promise<void> = runQueueLoop().finally(() => {
    // Identity check: a watchdog may have stolen the lock and started a
    // fresh run. Don't null out their promise with our stale reference.
    if (processingPromise === p) {
      processingPromise = null;
      processingStartedAt = 0;
    }
    debugLog("processQueue: done, processingPromise cleared");
  });
  processingPromise = p;
  return p;
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

/**
 * Manual retry (user clicks "Retry" button). We do the full reconnect dance
 * — rebuild the supabase client, re-validate auth, then flush — because the
 * usual reason a user clicks this is that the queue got wedged on something
 * only a fresh client can resolve.
 */
export function retryAllPending(): Promise<void> {
  return wakeAndFlush();
}

/**
 * Drop writes that have exhausted their retry budget. Used by the "Dismiss"
 * affordance on the failed pill — the local answer history is already in
 * localStorage, so losing the queued server-side copy is an acceptable
 * tradeoff to stop the indicator from being stuck forever on a permanent
 * error (e.g. references to data that doesn't exist on this server).
 *
 * Returns the number of entries actually discarded so callers (e.g. the
 * diagnostic console API) can report it without re-reading the queue.
 */
export function discardFailedPending(): number {
  const before = readQueue();
  const remaining = before.filter((w) => w.tries < MAX_TRIES);
  writeQueue(remaining);
  broadcast(recomputeStatus());
  return before.length - remaining.length;
}

export function getPendingCount(): number {
  return readQueue().length;
}

/**
 * Console diagnostic for verifying whether writes are actually reaching the
 * server. Users occasionally worry the "saving…" indicator means data is
 * being lost; this surfaces ground truth without shipping additional UI.
 *
 * Usage (in browser DevTools Console):
 *   await window.__kbTutorSyncInfo()
 *
 * Returns the current queue state plus server-side attempt counts so the
 * user can compare "things I just answered" against "rows actually in the
 * database". Intentionally untyped at the window level — this is a debug
 * affordance, not a product API.
 */
type SyncDiagnostic = {
  online: boolean;
  status: SyncStatus;
  pendingInQueue: number;
  pendingSample: Array<{
    kind: string;
    tries: number;
    nextAttemptAt: string;
    lastError?: string;
  }>;
  serverAttemptsTotal: number | null;
  serverAttemptsLastHour: number | null;
  serverError: string | null;
};

async function getSyncDiagnostic(): Promise<SyncDiagnostic> {
  const queue = readQueue();
  const pendingSample = queue.slice(0, 5).map((w) => ({
    kind: w.kind,
    tries: w.tries,
    nextAttemptAt: new Date(w.nextAttemptAt).toISOString(),
    lastError: w.lastError,
  }));

  const base: SyncDiagnostic = {
    online: isBrowser() ? navigator.onLine : true,
    status: lastBroadcast,
    pendingInQueue: queue.length,
    pendingSample,
    serverAttemptsTotal: null,
    serverAttemptsLastHour: null,
    serverError: null,
  };

  if (!canUseRemoteDb()) return base;

  try {
    const supabase = getSupabaseBrowserClient();
    const totalRes = await supabase
      .from("attempts")
      .select("*", { count: "exact", head: true });
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentRes = await supabase
      .from("attempts")
      .select("*", { count: "exact", head: true })
      .gte("answered_at", oneHourAgo);

    base.serverAttemptsTotal = totalRes.count ?? null;
    base.serverAttemptsLastHour = recentRes.count ?? null;
    if (totalRes.error) base.serverError = totalRes.error.message;
    else if (recentRes.error) base.serverError = recentRes.error.message;
  } catch (err) {
    base.serverError = err instanceof Error ? err.message : String(err);
  }

  return base;
}

let lifecycleInstalled = false;
/** Install online/visibility listeners + initial flush. Safe to call many times. */
export function installSyncLifecycle(): void {
  if (!isBrowser() || lifecycleInstalled) return;
  lifecycleInstalled = true;
  broadcast(recomputeStatus());
  // Expose both the diagnostic (`__kbTutorSyncInfo()`) and escape-hatch
  // helpers (`.retry()` / `.discard()` / `.queue()`) on `window` so the
  // queue can be inspected or unwedged from DevTools when the UI button
  // itself isn't responding. Attached here instead of at module scope so
  // SSR bundles don't touch `window`.
  const globalApi = getSyncDiagnostic as typeof getSyncDiagnostic & {
    retry: () => Promise<void>;
    discard: () => number;
    queue: () => PendingWrite[];
  };
  globalApi.retry = () => retryAllPending();
  globalApi.discard = () => discardFailedPending();
  globalApi.queue = () => readQueue();
  (
    window as unknown as {
      __kbTutorSyncInfo?: typeof globalApi;
    }
  ).__kbTutorSyncInfo = globalApi;
  window.addEventListener("online", () => {
    debugLog("event: online fired, navigator.onLine=", navigator.onLine);
    void wakeAndFlush();
  });
  window.addEventListener("offline", () => {
    debugLog("event: offline fired");
    broadcast(recomputeStatus());
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      debugLog("event: visibility=visible");
      // A hidden tab coming back doesn't necessarily mean the network state
      // changed, so we skip the full supabase-client rebuild that `online`
      // does; just flatten backoff and try to flush.
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
  isNonRetriableError,
  SyncWriteError,
  PROCESSING_STUCK_MS,
  /** Rig the processingPromise lock to a specific state for watchdog tests. */
  setLock(promise: Promise<void> | null, startedAt: number): void {
    processingPromise = promise;
    processingStartedAt = startedAt;
  },
  /** Read the lock state so tests can assert the watchdog actually replaced it. */
  getLock(): { promise: Promise<void> | null; startedAt: number } {
    return { promise: processingPromise, startedAt: processingStartedAt };
  },
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
    processingPromise = null;
    processingStartedAt = 0;
  },
};
