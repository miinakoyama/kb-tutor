import { describe, expect, it } from "vitest";
import {
  asDiagram,
  asDokLevel,
  asOptionalString,
  asQuestionType,
  asRationaleQuestion,
  normalizeQuestionPayload,
  sanitizeMode,
  sanitizeStringArray,
} from "@/lib/assignments/manage-helpers";

describe("asOptionalString", () => {
  it("returns trimmed string when value is non-empty", () => {
    expect(asOptionalString("  hi  ")).toBe("hi");
  });

  it("returns undefined for empty, whitespace, or non-string values", () => {
    expect(asOptionalString("")).toBeUndefined();
    expect(asOptionalString("   ")).toBeUndefined();
    expect(asOptionalString(123)).toBeUndefined();
    expect(asOptionalString(null)).toBeUndefined();
    expect(asOptionalString(undefined)).toBeUndefined();
  });
});

describe("asDokLevel", () => {
  it.each([1, 2, 3])("accepts DOK level %s", (value) => {
    expect(asDokLevel(value)).toBe(value);
  });

  it("rejects out-of-range numbers", () => {
    expect(asDokLevel(0)).toBeUndefined();
    expect(asDokLevel(4)).toBeUndefined();
    expect(asDokLevel(-1)).toBeUndefined();
  });

  it("rejects non-numbers", () => {
    expect(asDokLevel("2")).toBeUndefined();
    expect(asDokLevel(null)).toBeUndefined();
  });
});

describe("asQuestionType", () => {
  it("accepts 'mcq' and 'open-ended'", () => {
    expect(asQuestionType("mcq")).toBe("mcq");
    expect(asQuestionType("open-ended")).toBe("open-ended");
  });

  it("rejects other values", () => {
    expect(asQuestionType("multiple-choice")).toBeUndefined();
    expect(asQuestionType(42)).toBeUndefined();
  });
});

describe("sanitizeStringArray", () => {
  it("trims, drops empty strings, and dedupes", () => {
    expect(
      sanitizeStringArray(["  a", "a", " b ", "", "   ", "c"]),
    ).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array when input is not an array", () => {
    expect(sanitizeStringArray(null)).toEqual([]);
    expect(sanitizeStringArray("abc")).toEqual([]);
  });

  it("ignores non-string entries", () => {
    expect(sanitizeStringArray(["a", 42, null, { foo: "bar" }, "b"])).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("sanitizeMode", () => {
  it("passes through the three valid modes", () => {
    expect(sanitizeMode("practice")).toBe("practice");
    expect(sanitizeMode("exam")).toBe("exam");
    expect(sanitizeMode("review")).toBe("review");
  });

  it("defaults to 'practice' for any other value", () => {
    expect(sanitizeMode("random")).toBe("practice");
    expect(sanitizeMode(undefined)).toBe("practice");
    expect(sanitizeMode(null)).toBe("practice");
  });
});

describe("asDiagram", () => {
  it("accepts a diagram with a known type and object data", () => {
    const diagram = asDiagram({ type: "chart", data: { foo: 1 } });
    expect(diagram).toBeDefined();
    expect(diagram?.type).toBe("chart");
  });

  it("rejects unknown diagram types", () => {
    expect(asDiagram({ type: "bogus", data: {} })).toBeUndefined();
  });

  it("rejects missing or non-object data", () => {
    expect(asDiagram({ type: "chart" })).toBeUndefined();
    expect(asDiagram({ type: "chart", data: null })).toBeUndefined();
    expect(asDiagram({ type: "chart", data: "string" })).toBeUndefined();
  });

  it("rejects non-object roots", () => {
    expect(asDiagram(null)).toBeUndefined();
    expect(asDiagram("chart")).toBeUndefined();
  });
});

describe("asRationaleQuestion", () => {
  it("normalizes a rationale with enough options and a matching correct id", () => {
    const result = asRationaleQuestion({
      text: "Why?",
      options: [
        { id: "a", text: "Because" },
        { id: "b", text: "Also because" },
      ],
      correctOptionId: "b",
      explanation: "Because reasons",
    });

    expect(result).toEqual({
      text: "Why?",
      options: [
        { id: "a", text: "Because" },
        { id: "b", text: "Also because" },
      ],
      correctOptionId: "b",
      explanation: "Because reasons",
    });
  });

  it("falls back to the first option id when the correct id is invalid", () => {
    const result = asRationaleQuestion({
      text: "Q",
      options: [
        { id: "a", text: "x" },
        { id: "b", text: "y" },
      ],
      correctOptionId: "nonexistent",
    });
    expect(result?.correctOptionId).toBe("a");
  });

  it("generates option ids when missing", () => {
    const result = asRationaleQuestion({
      text: "Q",
      options: [{ text: "x" }, { text: "y" }],
    });
    expect(result?.options.map((option) => option.id)).toEqual([
      "opt_1",
      "opt_2",
    ]);
  });

  it("rejects rationales with fewer than two usable options", () => {
    expect(
      asRationaleQuestion({
        text: "Q",
        options: [{ text: "only one" }],
      }),
    ).toBeUndefined();
  });

  it("rejects empty question text", () => {
    expect(
      asRationaleQuestion({
        text: "   ",
        options: [
          { id: "a", text: "x" },
          { id: "b", text: "y" },
        ],
      }),
    ).toBeUndefined();
  });
});

describe("normalizeQuestionPayload", () => {
  it("returns null when text is missing", () => {
    expect(
      normalizeQuestionPayload(
        { options: [{ id: "A", text: "x" }, { id: "B", text: "y" }] },
        0,
        "manual",
      ),
    ).toBeNull();
  });

  it("returns null when there are fewer than two usable options", () => {
    expect(
      normalizeQuestionPayload(
        {
          text: "Q",
          options: [{ id: "A", text: "only" }, { id: "B", text: " " }],
          correctOptionId: "A",
        },
        0,
        "manual",
      ),
    ).toBeNull();
  });

  it("normalizes a valid MCQ payload with topic/module defaults", () => {
    const question = normalizeQuestionPayload(
      {
        text: "What is 2 + 2?",
        options: [
          { id: "A", text: "3" },
          { id: "B", text: "4" },
        ],
        correctOptionId: "B",
      },
      0,
      "manual",
    );

    expect(question).not.toBeNull();
    expect(question?.text).toBe("What is 2 + 2?");
    expect(question?.topic).toBe("Assignment");
    expect(question?.module).toBe(1);
    expect(question?.options).toHaveLength(2);
    expect(question?.correctOptionId).toBe("B");
    expect(question?.source).toBe("generated");
    expect(question?.isVisible).toBe(true);
  });

  it("clamps a negative or non-integer module to the minimum of 1", () => {
    const question = normalizeQuestionPayload(
      {
        text: "Q",
        module: -5,
        options: [
          { id: "A", text: "a" },
          { id: "B", text: "b" },
        ],
        correctOptionId: "A",
      },
      0,
      "manual",
    );
    expect(question?.module).toBe(1);
  });

  it("falls back to the first option when correctOptionId is not in options", () => {
    const question = normalizeQuestionPayload(
      {
        text: "Q",
        options: [
          { id: "A", text: "a" },
          { id: "B", text: "b" },
        ],
        correctOptionId: "Z",
      },
      0,
      "manual",
    );
    expect(question?.correctOptionId).toBe("A");
  });

  it("generates deterministic opt_ ids when option ids are missing", () => {
    const question = normalizeQuestionPayload(
      {
        text: "Q",
        options: [{ text: "a" }, { text: "b" }],
      },
      0,
      "manual",
    );
    expect(question?.options.map((option) => option.id)).toEqual([
      "opt_1",
      "opt_2",
    ]);
  });

  it("preserves an explicit question id", () => {
    const question = normalizeQuestionPayload(
      {
        id: "custom-id",
        text: "Q",
        options: [
          { id: "A", text: "a" },
          { id: "B", text: "b" },
        ],
        correctOptionId: "A",
      },
      0,
      "manual",
    );
    expect(question?.id).toBe("custom-id");
  });

  it("synthesizes a question id that encodes the source type and index", () => {
    const question = normalizeQuestionPayload(
      {
        text: "Q",
        options: [
          { id: "A", text: "a" },
          { id: "B", text: "b" },
        ],
      },
      7,
      "generated_now",
    );
    expect(question?.id).toContain("assignment-generated_now");
    expect(question?.id?.endsWith("-8")).toBe(true);
  });

  it("drops options whose text is blank after trimming", () => {
    const question = normalizeQuestionPayload(
      {
        text: "Q",
        options: [
          { id: "A", text: "a" },
          { id: "B", text: "   " },
          { id: "C", text: "c" },
        ],
        correctOptionId: "A",
      },
      0,
      "manual",
    );
    expect(question?.options.map((option) => option.id)).toEqual(["A", "C"]);
  });

  it("returns null when the raw payload is not an object", () => {
    expect(normalizeQuestionPayload(null, 0, "manual")).toBeNull();
    expect(normalizeQuestionPayload("oops", 0, "manual")).toBeNull();
  });
});
