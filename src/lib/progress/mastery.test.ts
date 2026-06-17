import { describe, expect, it } from "vitest";
import { getStandardsForModule } from "@/lib/standards";
import {
  calculateMastery,
  getMasteryBand,
  PROGRESS_TOPICS,
  type AttemptRow,
} from "@/lib/progress/mastery";

function getTopicKeyFromStandard(standardId: string): string {
  for (const { module } of PROGRESS_TOPICS) {
    const standard = getStandardsForModule(module).find((item) => item.id === standardId);
    if (standard) {
      return `Module ${standard.module} - ${standard.category}`;
    }
  }
  throw new Error("Standard id not found in PROGRESS_TOPICS");
}

describe("calculateMastery", () => {
  it("marks topics without attempts as insufficient_data", () => {
    const mastery = calculateMastery([]);

    expect(mastery.length).toBeGreaterThan(0);
    expect(mastery.every((item) => item.level === "insufficient_data")).toBe(true);
    expect(mastery.every((item) => item.masteryValue === 0)).toBe(true);
  });

  it("uses a gentle estimate for low-attempt topics", () => {
    const standard = getStandardsForModule("A")[0];
    const key = getTopicKeyFromStandard(standard.id);

    const rows: AttemptRow[] = [
      {
        is_correct: false,
        answered_at: "2026-01-01T00:00:00.000Z",
        topic: null,
        standard_id: standard.id,
      },
    ];

    const mastery = calculateMastery(rows);
    const datum = mastery.find((item) => item.topic === key);

    expect(datum).toBeDefined();
    expect(datum?.attempts).toBe(1);
    expect(datum?.level).toBe("estimated");
    // (0 + 3) / (1 + 5) => 50%
    expect(datum?.mastery).toBe(50);
  });

  it("switches to measured level after enough attempts", () => {
    const standard = getStandardsForModule("A")[0];
    const key = getTopicKeyFromStandard(standard.id);

    const rows: AttemptRow[] = [
      {
        is_correct: true,
        answered_at: "2026-01-01T00:00:00.000Z",
        topic: null,
        standard_id: standard.id,
      },
      {
        is_correct: false,
        answered_at: "2026-01-02T00:00:00.000Z",
        topic: null,
        standard_id: standard.id,
      },
      {
        is_correct: true,
        answered_at: "2026-01-03T00:00:00.000Z",
        topic: null,
        standard_id: standard.id,
      },
    ];

    const mastery = calculateMastery(rows);
    const datum = mastery.find((item) => item.topic === key);

    expect(datum).toBeDefined();
    expect(datum?.attempts).toBe(3);
    expect(datum?.level).toBe("measured");
    // (2 + 3) / (3 + 5) => 62.5 => 63%
    expect(datum?.mastery).toBe(63);
  });
});

describe("getMasteryBand", () => {
  it("uses raw accuracy instead of smoothed mastery for rubric bands", () => {
    expect(getMasteryBand(17, 20)).toBe("mastered");
  });

  it("requires both the accuracy and minimum attempt count", () => {
    expect(getMasteryBand(17, 19)).toBe("on_track");
    expect(getMasteryBand(0, 0)).toBe("no_data");
  });
});
