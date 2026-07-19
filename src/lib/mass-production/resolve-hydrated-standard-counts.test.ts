import { describe, expect, it, vi } from "vitest";
import { resolveHydratedStandardCounts } from "./resolve-hydrated-standard-counts";

describe("resolveHydratedStandardCounts", () => {
  const selectedStandardIds = ["A.1", "A.2", "A.3"];
  const distribute = vi.fn(
    (ids: string[], total: number): Record<string, number> => {
      const counts: Record<string, number> = {};
      for (const id of ids) counts[id] = 0;
      if (ids[0]) counts[ids[0]] = total;
      return counts;
    },
  );

  it("preserves pending all-zero drafts when standardCounts were saved", () => {
    const normalizedCounts = { "A.1": 0, "A.2": 0, "A.3": 0 };
    const result = resolveHydratedStandardCounts({
      selectedStandardIds,
      normalizedCounts,
      totalTarget: 5,
      hasSavedStandardCounts: true,
      distribute,
    });
    expect(result).toEqual(normalizedCounts);
    expect(distribute).not.toHaveBeenCalled();
  });

  it("preserves partial drafts that do not yet sum to the target", () => {
    const normalizedCounts = { "A.1": 2, "A.2": 0, "A.3": 1 };
    const result = resolveHydratedStandardCounts({
      selectedStandardIds,
      normalizedCounts,
      totalTarget: 5,
      hasSavedStandardCounts: true,
      distribute,
    });
    expect(result).toEqual(normalizedCounts);
    expect(distribute).not.toHaveBeenCalled();
  });

  it("keeps counts that already match the target", () => {
    const normalizedCounts = { "A.1": 2, "A.2": 2, "A.3": 1 };
    const result = resolveHydratedStandardCounts({
      selectedStandardIds,
      normalizedCounts,
      totalTarget: 5,
      hasSavedStandardCounts: true,
      distribute,
    });
    expect(result).toEqual(normalizedCounts);
    expect(distribute).not.toHaveBeenCalled();
  });

  it("auto-distributes only for legacy saves missing standardCounts", () => {
    const normalizedCounts = { "A.1": 0, "A.2": 0, "A.3": 0 };
    const result = resolveHydratedStandardCounts({
      selectedStandardIds,
      normalizedCounts,
      totalTarget: 5,
      hasSavedStandardCounts: false,
      distribute,
    });
    expect(distribute).toHaveBeenCalledWith(selectedStandardIds, 5);
    expect(result).toEqual({ "A.1": 5, "A.2": 0, "A.3": 0 });
  });
});
