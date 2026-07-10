import { describe, expect, it } from "vitest";
import {
  containsPlaceholder,
  validateDiagramSvg,
  validateShortAnswerItem,
} from "@/lib/short-answer/item-schema";
import sampleItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";

function clone(): ShortAnswerItem {
  return structuredClone(sampleItem) as ShortAnswerItem;
}

describe("validateShortAnswerItem", () => {
  it("accepts the bundled sample item", () => {
    expect(validateShortAnswerItem(sampleItem)).toBeNull();
  });

  it("rejects a non-object", () => {
    expect(validateShortAnswerItem(null)).toMatch(/must be an object/);
  });

  it("rejects a missing stem", () => {
    const item = clone();
    (item as { stem: string }).stem = "";
    expect(validateShortAnswerItem(item)).toMatch(/stem/);
  });

  it("rejects placeholder text in the stem", () => {
    const item = clone();
    item.stem = "Consider [insert organism] and its cells.";
    expect(validateShortAnswerItem(item)).toMatch(/placeholder/);
  });

  it("rejects when stimulus type does not match blueprint stimulus type", () => {
    const item = clone();
    item.blueprint.stimulusType = "scenario";
    expect(validateShortAnswerItem(item)).toMatch(/stimulusType/);
  });

  it("rejects when a part rubric point value does not match maxScore", () => {
    const item = clone();
    item.parts[0].rubric.pointsPossible = 2;
    expect(validateShortAnswerItem(item)).toMatch(/must equal maxScore/);
  });

  it("rejects when a part rubric score level is missing", () => {
    const item = clone();
    delete item.parts[0].rubric.criteria["1"];
    expect(validateShortAnswerItem(item)).toMatch(/rubric.criteria must include score 1/);
  });

  it("rejects when an annotated score level is missing", () => {
    const item = clone();
    item.annotatedResponses = item.annotatedResponses.filter(
      (r) => r.score !== 3,
    );
    expect(validateShortAnswerItem(item)).toMatch(/score levels: 3/);
  });

  it("rejects an unsafe diagram SVG", () => {
    const item = clone();
    item.stimulus = {
      type: "diagram",
      title: "Cell diagram",
      diagramSvg: "<svg><script>alert(1)</script></svg>",
    };
    item.blueprint.stimulusType = "diagram";
    expect(validateShortAnswerItem(item)).toMatch(/script/);
  });

  it("rejects an unknown task type when a taxonomy list is supplied", () => {
    const item = clone();
    const result = validateShortAnswerItem(item, {
      validTaskTypes: ["Explain Mechanism", "Prediction"],
    });
    expect(result).toMatch(/taskType is not a taxonomy task type/);
  });

  it("rejects a bad standard id via the blueprint", () => {
    const item = clone();
    item.blueprint.targetStandard = "9.9.9-99.Z";
    expect(validateShortAnswerItem(item)).toMatch(/not a known standard/);
  });

  it("enforces the requested standard id when supplied", () => {
    const item = clone();
    const result = validateShortAnswerItem(item, { standardId: "3.1.9-12.B" });
    expect(result).toMatch(/must equal/);
  });

  it("rejects parts that are out of A/B/C order", () => {
    const item = clone();
    item.parts[0].label = "B";
    expect(validateShortAnswerItem(item)).toMatch(/order/);
  });
});

describe("validateDiagramSvg", () => {
  it("accepts a plain inline svg", () => {
    expect(
      validateDiagramSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
    ).toBeNull();
  });

  it("rejects event handlers", () => {
    expect(validateDiagramSvg('<svg><rect onclick="x()"/></svg>')).toMatch(
      /event handler/,
    );
  });

  it("rejects external references", () => {
    expect(
      validateDiagramSvg('<svg><image href="https://evil.example/x.png"/></svg>'),
    ).toMatch(/external/);
  });
});

describe("containsPlaceholder", () => {
  it("flags square-bracket and angle-bracket templates", () => {
    expect(containsPlaceholder("[insert value]")).toBe(true);
    expect(containsPlaceholder("<organism>")).toBe(true);
    expect(containsPlaceholder("normal text")).toBe(false);
  });
});
