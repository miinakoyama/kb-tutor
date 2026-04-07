import { describe, it, expect } from "vitest";
import { stripLatexDelimiters, stripLatexDelimitersOptional } from "./latex";

describe("stripLatexDelimiters", () => {
  it("removes inline math delimiters $...$", () => {
    expect(stripLatexDelimiters("The value is $x + 1$")).toBe(
      "The value is x + 1"
    );
  });

  it("removes display math delimiters $$...$$", () => {
    expect(stripLatexDelimiters("$$x^2 + y^2 = r^2$$")).toBe(
      "x^2 + y^2 = r^2"
    );
  });

  it("removes multiple inline math expressions", () => {
    expect(stripLatexDelimiters("$a$ and $b$")).toBe("a and b");
  });

  it("removes display math that spans multiple lines", () => {
    expect(stripLatexDelimiters("$$x\ny$$")).toBe("x\ny");
  });

  it("leaves plain text unchanged", () => {
    expect(stripLatexDelimiters("no math here")).toBe("no math here");
  });

  it("handles empty string", () => {
    expect(stripLatexDelimiters("")).toBe("");
  });
});

describe("stripLatexDelimitersOptional", () => {
  it("returns undefined when given undefined", () => {
    expect(stripLatexDelimitersOptional(undefined)).toBeUndefined();
  });

  it("strips delimiters from a string value", () => {
    expect(stripLatexDelimitersOptional("$x$")).toBe("x");
  });

  it("returns plain string unchanged", () => {
    expect(stripLatexDelimitersOptional("hello")).toBe("hello");
  });
});
