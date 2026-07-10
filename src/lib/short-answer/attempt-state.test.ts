import { describe, expect, it } from "vitest";
import sampleItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";
import { buildPartRuntimesFromStoredAttempts } from "./attempt-state";

const item = sampleItem as ShortAnswerItem;

describe("buildPartRuntimesFromStoredAttempts", () => {
  it("restores a failed first attempt and keeps the second try available", () => {
    const { runtimes, allResolved } = buildPartRuntimesFromStoredAttempts(
      item.parts,
      [
        {
          id: "attempt-1",
          part_label: "A",
          attempt_number: 1,
          response_text: "dna",
          feedback: { verdict: "good_try", segments: [{ label: "", text: "Try again." }] },
          is_correct: false,
        },
      ],
    );

    expect(allResolved).toBe(false);
    expect(runtimes[0].status).toBe("active");
    expect(runtimes[0].attempts).toHaveLength(1);
    expect(runtimes[0].triesLeft).toBe(1);
    expect(runtimes[0].latestFeedback?.verdict).toBe("good_try");
    expect(runtimes[1].status).toBe("locked");
  });

  it("marks later parts active once earlier parts resolve", () => {
    const { runtimes, allResolved } = buildPartRuntimesFromStoredAttempts(
      item.parts,
      [
        {
          id: "attempt-a",
          part_label: "A",
          attempt_number: 1,
          response_text: "mRNA",
          feedback: { verdict: "correct", segments: [{ label: "", text: "Right." }] },
          is_correct: true,
        },
      ],
    );

    expect(allResolved).toBe(false);
    expect(runtimes[0].status).toBe("resolved");
    expect(runtimes[1].status).toBe("active");
  });
});
