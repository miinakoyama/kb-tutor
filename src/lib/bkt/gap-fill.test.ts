import { describe, expect, it } from "vitest";
import { computeCoverageGaps, type StandardCoverageRow } from "./gap-fill";

const rows: StandardCoverageRow[] = [
  {
    standardId: "BIO.A.1",
    kcs: [
      { code: "BIO.A.1.K1", mcqCount: 0, saqCount: 0 },
      { code: "BIO.A.1.K2", mcqCount: 2, saqCount: 1 },
    ],
  },
  {
    standardId: "BIO.A.2",
    kcs: [{ code: "BIO.A.2.K1", mcqCount: 5, saqCount: 5 }],
  },
];

describe("computeCoverageGaps", () => {
  it("emits the per-format deficit for each KC of a selected standard", () => {
    const items = computeCoverageGaps(rows, ["BIO.A.1"], 2);
    const byKey = (standardId: string, kcCode: string, format: string) =>
      items.filter(
        (item) =>
          item.standardId === standardId &&
          item.kcCode === kcCode &&
          item.format === format,
      ).length;
    expect(byKey("BIO.A.1", "BIO.A.1.K1", "mcq")).toBe(2);
    expect(byKey("BIO.A.1", "BIO.A.1.K1", "saq")).toBe(2);
    expect(byKey("BIO.A.1", "BIO.A.1.K2", "mcq")).toBe(0);
    expect(byKey("BIO.A.1", "BIO.A.1.K2", "saq")).toBe(1);
    expect(items).toHaveLength(5);
  });

  it("ignores standards that are not selected", () => {
    const items = computeCoverageGaps(rows, ["BIO.A.2"], 2);
    expect(items).toHaveLength(0);
  });

  it("returns nothing when every KC already meets the target", () => {
    expect(computeCoverageGaps(rows, ["BIO.A.1", "BIO.A.2"], 0)).toHaveLength(0);
    expect(computeCoverageGaps(rows, ["BIO.A.2"], 5)).toHaveLength(0);
  });

  it("interleaves rounds across KCs so partial runs spread coverage", () => {
    const items = computeCoverageGaps(
      [
        {
          standardId: "BIO.B.1",
          kcs: [
            { code: "K1", mcqCount: 0, saqCount: 2 },
            { code: "K2", mcqCount: 0, saqCount: 2 },
          ],
        },
      ],
      ["BIO.B.1"],
      2,
    );
    expect(items.map((item) => item.kcCode)).toEqual(["K1", "K2", "K1", "K2"]);
    expect(items.every((item) => item.format === "mcq")).toBe(true);
  });

  it("treats negative counts as zero", () => {
    const items = computeCoverageGaps(
      [{ standardId: "S", kcs: [{ code: "K", mcqCount: -3, saqCount: 2 }] }],
      ["S"],
      2,
    );
    expect(items).toHaveLength(2);
  });
});
