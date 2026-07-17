import { describe, expect, it } from "vitest";
import { runWithConcurrency } from "./generate-item";

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
