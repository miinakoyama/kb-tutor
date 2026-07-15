import { describe, expect, it, vi } from "vitest";
import sampleItem from "@/data/short-answer/sample-item.json";
import type { Question } from "@/types/question";
import type { ShortAnswerItem } from "@/types/short-answer";
import {
  filterRenderableQuestions,
  resolveRuntimeShortAnswerItem,
} from "./question-guards";

function legacyItem(): ShortAnswerItem {
  const item = structuredClone(sampleItem) as ShortAnswerItem;
  const reusedDefinition =
    "Distinguish the related concepts and identify their key differences.";
  item.keyTerms = [
    { term: "prokaryotic", definition: reusedDefinition },
    { term: "eukaryotic", definition: reusedDefinition },
    { term: "nucleus", definition: "A membrane-bound structure that contains DNA." },
  ];
  return item;
}

function question(shortAnswer: ShortAnswerItem): Question {
  return {
    id: "saq-1",
    module: 1,
    topic: "Cells",
    text: shortAnswer.parts[0].prompt,
    options: [],
    correctOptionId: "",
    source: "generated",
    questionType: "open-ended",
    shortAnswer,
  };
}

describe("resolveRuntimeShortAnswerItem", () => {
  it("keeps a valid current item unchanged", () => {
    const item = structuredClone(sampleItem) as ShortAnswerItem;
    const resolved = resolveRuntimeShortAnswerItem(item);

    expect(resolved).toEqual({
      item,
      error: null,
      repairedLegacyKeyTerms: false,
    });
    expect(resolved.item).toBe(item);
  });

  it("removes every term whose legacy definition is reused", () => {
    const resolved = resolveRuntimeShortAnswerItem(legacyItem());

    expect(resolved.error).toBeNull();
    expect(resolved.repairedLegacyKeyTerms).toBe(true);
    expect(resolved.item?.keyTerms).toEqual([
      {
        term: "nucleus",
        definition: "A membrane-bound structure that contains DNA.",
      },
    ]);
  });

  it("does not relax unrelated structural validation", () => {
    const item = legacyItem();
    item.parts[0].maxLength = 0;

    const resolved = resolveRuntimeShortAnswerItem(item);

    expect(resolved.item).toBeNull();
    expect(resolved.error).toMatch(/maxLength/);
  });
});

describe("filterRenderableQuestions", () => {
  it("returns a renderable copy with legacy key terms repaired", () => {
    const input = question(legacyItem());

    const [output] = filterRenderableQuestions([input]);

    expect(output).not.toBe(input);
    expect(output.shortAnswer?.keyTerms).toHaveLength(1);
  });

  it("still drops a structurally unsafe short-answer item", () => {
    const item = structuredClone(sampleItem) as ShortAnswerItem;
    item.stimulus = {
      type: "diagram",
      title: "Unsafe",
      diagramSvg: "<svg><script>alert(1)</script></svg>",
    };
    item.blueprint.stimulusType = "diagram";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(filterRenderableQuestions([question(item)])).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("scripts"));
    warn.mockRestore();
  });
});
