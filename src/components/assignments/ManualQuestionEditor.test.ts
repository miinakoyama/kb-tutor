import { describe, it, expect } from "vitest";
import {
  MAX_OPTIONS,
  createEmptyDraft,
  letterForIndex,
  manualDraftToQuestion,
  validateDraft,
  type ManualOptionDraft,
  type ManualQuestionDraft,
} from "./ManualQuestionEditor";

function makeOption(
  overrides: Partial<ManualOptionDraft> & { id: string },
): ManualOptionDraft {
  return {
    text: "",
    feedback: "",
    ...overrides,
  };
}

function makeDraft(
  overrides: Partial<ManualQuestionDraft> = {},
): ManualQuestionDraft {
  return {
    ...createEmptyDraft(),
    ...overrides,
  };
}

describe("letterForIndex", () => {
  it("returns the matching letter for each valid index", () => {
    const letters = ["A", "B", "C", "D", "E", "F"];
    for (let i = 0; i < MAX_OPTIONS; i += 1) {
      expect(letterForIndex(i)).toBe(letters[i]);
    }
  });

  it("throws when the index equals MAX_OPTIONS (just out of range)", () => {
    expect(() => letterForIndex(MAX_OPTIONS)).toThrow(
      /exceeds MAX_OPTIONS/,
    );
  });

  it("throws for any index beyond MAX_OPTIONS", () => {
    expect(() => letterForIndex(MAX_OPTIONS + 5)).toThrow(
      /exceeds MAX_OPTIONS/,
    );
  });

  it("throws for negative indices", () => {
    expect(() => letterForIndex(-1)).toThrow(/exceeds MAX_OPTIONS/);
  });
});

describe("manualDraftToQuestion", () => {
  it("maps option ids to sequential letters A..D", () => {
    const draft = makeDraft({
      text: "What is 2 + 2?",
      options: [
        makeOption({ id: "opt_1", text: "3", feedback: "wrong" }),
        makeOption({ id: "opt_2", text: "4", feedback: "correct" }),
        makeOption({ id: "opt_3", text: "5", feedback: "wrong" }),
        makeOption({ id: "opt_4", text: "6", feedback: "wrong" }),
      ],
      correctOptionId: "opt_2",
    });

    const question = manualDraftToQuestion(draft, 0);

    expect(question.options.map((o) => o.id)).toEqual(["A", "B", "C", "D"]);
    expect(question.correctOptionId).toBe("B");
  });

  it("drops options with blank text and keeps letters contiguous", () => {
    const draft = makeDraft({
      text: "Pick one",
      options: [
        makeOption({ id: "opt_1", text: "first", feedback: "f1" }),
        makeOption({ id: "opt_2", text: "", feedback: "" }),
        makeOption({ id: "opt_3", text: "third", feedback: "f3" }),
        makeOption({ id: "opt_4", text: "fourth", feedback: "f4" }),
      ],
      correctOptionId: "opt_3",
    });

    const question = manualDraftToQuestion(draft, 0);

    expect(question.options.map((o) => o.id)).toEqual(["A", "B", "C"]);
    expect(question.options.map((o) => o.text)).toEqual([
      "first",
      "third",
      "fourth",
    ]);
    expect(question.correctOptionId).toBe("B");
  });

  it("falls back to the first option id when correctOptionId is invalid", () => {
    const draft = makeDraft({
      text: "Q",
      options: [
        makeOption({ id: "opt_1", text: "a", feedback: "fa" }),
        makeOption({ id: "opt_2", text: "b", feedback: "fb" }),
      ],
      correctOptionId: "does-not-exist",
    });

    const question = manualDraftToQuestion(draft, 0);

    expect(question.correctOptionId).toBe("A");
  });

  it("slices options down to MAX_OPTIONS and does not throw", () => {
    const overflowOptions = Array.from(
      { length: MAX_OPTIONS + 3 },
      (_, i) =>
        makeOption({
          id: `opt_${i + 1}`,
          text: `choice ${i + 1}`,
          feedback: `fb ${i + 1}`,
        }),
    );
    const draft = makeDraft({
      text: "Too many",
      options: overflowOptions,
      correctOptionId: "opt_1",
    });

    expect(() => manualDraftToQuestion(draft, 0)).not.toThrow();
    const question = manualDraftToQuestion(draft, 0);
    expect(question.options).toHaveLength(MAX_OPTIONS);
    expect(question.options.map((o) => o.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
    ]);
  });

  it("slices overflow even when the correct option would be beyond MAX_OPTIONS", () => {
    const overflowOptions = Array.from(
      { length: MAX_OPTIONS + 2 },
      (_, i) =>
        makeOption({
          id: `opt_${i + 1}`,
          text: `choice ${i + 1}`,
          feedback: `fb ${i + 1}`,
        }),
    );
    const draft = makeDraft({
      text: "Too many",
      options: overflowOptions,
      correctOptionId: `opt_${MAX_OPTIONS + 1}`,
    });

    const question = manualDraftToQuestion(draft, 0);
    expect(question.options).toHaveLength(MAX_OPTIONS);
    expect(question.correctOptionId).toBe("A");
  });
});

describe("validateDraft", () => {
  it("returns null for a fully filled draft", () => {
    const draft = makeDraft({
      text: "Q",
      options: [
        makeOption({ id: "opt_1", text: "a", feedback: "fa" }),
        makeOption({ id: "opt_2", text: "b", feedback: "fb" }),
      ],
      correctOptionId: "opt_1",
      standardId: "some-id",
      dok: 1,
      focusHint: "hint",
      keyKnowledge: "knowledge",
      commonMisconception: "miscon",
    });

    expect(validateDraft(draft)).toBeNull();
  });

  it("requires question text", () => {
    const draft = makeDraft({ text: "   " });
    expect(validateDraft(draft)).toMatch(/Question text/i);
  });

  it("requires at least two non-empty options", () => {
    const draft = makeDraft({
      text: "Q",
      options: [
        makeOption({ id: "opt_1", text: "only one", feedback: "fb" }),
        makeOption({ id: "opt_2", text: "", feedback: "" }),
      ],
    });
    expect(validateDraft(draft)).toMatch(/at least two/i);
  });
});
