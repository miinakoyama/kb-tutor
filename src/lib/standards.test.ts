import { describe, expect, it } from "vitest";
import {
  STANDARD_DEFINITIONS,
  getAllStandards,
  getDefaultStandardForTopic,
  getModuleNumberForStandard,
  getStandardById,
  getStandardForTopic,
  getStandardsByFilter,
  getStandardsForModule,
  getStandardsForTopic,
  getTopicForStandard,
} from "@/lib/standards";

describe("getStandardById", () => {
  it("returns the matching standard", () => {
    expect(getStandardById("3.1.9-12.A")).toMatchObject({
      id: "3.1.9-12.A",
      module: "A",
    });
  });

  it("returns undefined for unknown ids", () => {
    expect(getStandardById("not-a-standard")).toBeUndefined();
  });
});

describe("getStandardsForModule", () => {
  it("returns only standards for the given module", () => {
    const aOnly = getStandardsForModule("A");
    expect(aOnly.length).toBeGreaterThan(0);
    expect(aOnly.every((s) => s.module === "A")).toBe(true);
  });

  it("returns a non-empty list for each module", () => {
    expect(getStandardsForModule("A").length).toBeGreaterThan(0);
    expect(getStandardsForModule("B").length).toBeGreaterThan(0);
  });
});

describe("getStandardsByFilter", () => {
  it("filters by module and category together", () => {
    const result = getStandardsByFilter({
      module: "A",
      category: "Structure and Function",
    });
    expect(result.length).toBeGreaterThan(0);
    expect(
      result.every(
        (s) => s.module === "A" && s.category === "Structure and Function",
      ),
    ).toBe(true);
  });

  it("returns every standard when given no filter", () => {
    expect(getStandardsByFilter().length).toBe(STANDARD_DEFINITIONS.length);
  });
});

describe("getDefaultStandardForTopic", () => {
  it("returns a standard parsed from a 'Module X - Category' string", () => {
    const standard = getDefaultStandardForTopic(
      "Module A - Structure and Function",
    );
    expect(standard.module).toBe("A");
    expect(standard.category).toBe("Structure and Function");
  });

  it("falls back to the legacy topic map for canonical topic names", () => {
    expect(getDefaultStandardForTopic("Genetics").id).toBe("3.1.9-12.P");
    expect(getDefaultStandardForTopic("Ecology").id).toBe("3.1.9-12.L");
  });

  it("falls back to the first defined standard for completely unknown topics", () => {
    const first = STANDARD_DEFINITIONS[0];
    expect(getDefaultStandardForTopic("something unrelated")).toBe(first);
  });

  it("is reachable via getStandardForTopic alias", () => {
    expect(getStandardForTopic("Genetics").id).toBe("3.1.9-12.P");
  });
});

describe("getStandardsForTopic", () => {
  it("returns an empty array for malformed input", () => {
    expect(getStandardsForTopic("")).toEqual([]);
  });

  it("parses 'Module X - Category' into a module+category filter", () => {
    const rows = getStandardsForTopic("Module A - Structure and Function");
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every(
        (s) => s.module === "A" && s.category === "Structure and Function",
      ),
    ).toBe(true);
  });
});

describe("getModuleNumberForStandard", () => {
  it("returns 1 for module A", () => {
    expect(getModuleNumberForStandard("3.1.9-12.A")).toBe(1);
  });

  it("returns 2 for module B", () => {
    expect(getModuleNumberForStandard("3.1.9-12.P")).toBe(2);
  });

  it("returns 1 for unknown ids", () => {
    expect(getModuleNumberForStandard("bogus")).toBe(1);
  });
});

describe("getTopicForStandard", () => {
  it("returns the category for a known standard", () => {
    expect(getTopicForStandard("3.1.9-12.A")).toBe("Structure and Function");
  });

  it("returns 'Assignment' for unknown ids", () => {
    expect(getTopicForStandard("bogus")).toBe("Assignment");
  });
});

describe("getAllStandards", () => {
  it("exposes the full list without duplicates", () => {
    const all = getAllStandards();
    const ids = all.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
