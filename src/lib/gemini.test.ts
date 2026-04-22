import { describe, expect, it } from "vitest";
import { parseGeneratedQuestions } from "@/lib/gemini";

describe("parseGeneratedQuestions", () => {
  it("parses a clean JSON array", () => {
    const text = `[{"text": "Q1"}, {"text": "Q2"}]`;
    const result = parseGeneratedQuestions(text);
    expect(result).toEqual([{ text: "Q1" }, { text: "Q2" }]);
  });

  it("strips ```json code fences", () => {
    const text = "```json\n[{\"text\": \"Q1\"}]\n```";
    const result = parseGeneratedQuestions(text);
    expect(result).toEqual([{ text: "Q1" }]);
  });

  it("strips bare ``` code fences", () => {
    const text = "```\n[{\"text\": \"Q1\"}]\n```";
    const result = parseGeneratedQuestions(text);
    expect(result).toEqual([{ text: "Q1" }]);
  });

  it("extracts the array when surrounded by narrative prose", () => {
    const text =
      'Here are your questions:\n[{"text":"Q1"}]\nLet me know if you need more.';
    const result = parseGeneratedQuestions(text);
    expect(result).toEqual([{ text: "Q1" }]);
  });

  it("repairs minor JSON errors via jsonrepair (trailing commas)", () => {
    const text = `[{"text":"Q1",},]`;
    const result = parseGeneratedQuestions(text);
    expect(result).toEqual([{ text: "Q1" }]);
  });

  it("throws when the content is not an array", () => {
    expect(() => parseGeneratedQuestions(`{"text":"not-an-array"}`)).toThrow(
      /not an array/i,
    );
  });

  it("throws when the content is unparseable gibberish", () => {
    expect(() => parseGeneratedQuestions("definitely not json")).toThrow();
  });
});
