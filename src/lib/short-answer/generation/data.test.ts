import { describe, expect, it } from "vitest";
import { selectStudyGuideChunksForCoreKC } from "./data";

describe("selectStudyGuideChunksForCoreKC", () => {
  it("keeps top-2 chunks and samples two more from ranks 3-8", () => {
    const chunks = Array.from({ length: 10 }, (_, i) => ({
      chunkId: `sg-${i}`,
      text: `chunk ${i}`,
      score: 1 - i * 0.05,
    }));

    const selected = selectStudyGuideChunksForCoreKC(chunks);
    expect(selected).toHaveLength(4);
    expect(selected[0].chunkId).toBe("sg-0");
    expect(selected[1].chunkId).toBe("sg-1");
    expect(selected.map((c) => c.chunkId)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^sg-[2-7]$/)]),
    );
  });
});
