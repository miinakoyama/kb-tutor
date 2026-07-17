import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateItemWithRetry,
  runWithConcurrency,
  withRetry,
  type GeneratedItemResult,
} from "./generate-item";

afterEach(() => {
  vi.useRealTimers();
});

describe("generateItemWithRetry", () => {
  it("retries transient failures until success", async () => {
    vi.useFakeTimers();
    const results: GeneratedItemResult[] = [
      { ok: false, error: "network error", transient: true },
      { ok: true, questions: [] },
    ];
    let calls = 0;
    const promise = generateItemWithRetry(async () => {
      calls += 1;
      return results.shift() as GeneratedItemResult;
    });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ ok: true, questions: [] });
    expect(calls).toBe(2);
  });

  it("does not retry non-transient failures", async () => {
    let calls = 0;
    const result = await generateItemWithRetry(async () => {
      calls += 1;
      return { ok: false, error: "bad request", transient: false };
    });
    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
  });

  it("gives up after the attempt budget", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const promise = generateItemWithRetry(async () => {
      calls += 1;
      return { ok: false, error: "network error", transient: true };
    }, 3);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(calls).toBe(3);
  });
});

describe("withRetry", () => {
  it("returns the first successful result", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const promise = withRetry(async () => {
      calls += 1;
      if (calls < 3) throw new Error("Failed to fetch");
      return "saved";
    });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("saved");
    expect(calls).toBe(3);
  });

  it("throws the last error once attempts are exhausted", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const promise = withRetry(async () => {
      calls += 1;
      throw new Error(`attempt ${calls}`);
    }, 2);
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("attempt 2");
    expect(calls).toBe(2);
  });
});

describe("runWithConcurrency", () => {
  it("returns results in task order", async () => {
    const tasks = [10, 5, 1].map(
      (delay, index) => () =>
        new Promise<number>((resolve) =>
          setTimeout(() => resolve(index), delay),
        ),
    );
    await expect(runWithConcurrency(tasks, 3)).resolves.toEqual([0, 1, 2]);
  });

  it("never runs more than `limit` tasks at once", async () => {
    let running = 0;
    let peak = 0;
    const tasks = Array.from({ length: 8 }, () => async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
    });
    await runWithConcurrency(tasks, 3);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("reports settled counts monotonically", async () => {
    const seen: number[] = [];
    const tasks = Array.from({ length: 4 }, () => async () => undefined);
    await runWithConcurrency(tasks, 2, (count) => seen.push(count));
    expect(seen).toEqual([1, 2, 3, 4]);
  });
});
