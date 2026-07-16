import { describe, expect, it } from "vitest";
import sampleItem from "../../src/data/short-answer/sample-item.json";
import { validateShortAnswerItem } from "../../src/lib/short-answer/item-schema";
import type { ShortAnswerItem } from "../../src/types/short-answer";
import { parseArgs, validateDecision } from "./backfill-key-terms";

function legacyItem(): ShortAnswerItem {
  const item = structuredClone(sampleItem) as ShortAnswerItem;
  const reusedDefinition =
    "Explain the relationships among the concepts represented in this question.";
  item.keyTerms = [
    { term: "prokaryotic", definition: reusedDefinition },
    { term: "eukaryotic", definition: reusedDefinition },
  ];
  return item;
}

describe("key-term backfill CLI", () => {
  it("defaults to a dry-run with GPT-5.4", () => {
    const options = parseArgs([]);

    expect(options.model).toBe("gpt-5.4");
    expect(options.apply).toBe(false);
    expect(options.batchSize).toBe(5);
  });

  it("requires an explicit confirmation before enabling writes", () => {
    expect(() => parseArgs(["--apply"])).toThrow(/--confirm/);
    expect(
      parseArgs([
        "--apply",
        "--confirm",
        "APPLY_KEY_TERM_BACKFILL",
      ]).apply,
    ).toBe(true);
  });
});

describe("validateDecision", () => {
  it("accepts term-specific definitions and produces a strictly valid item", () => {
    const item = legacyItem();
    const keyTerms = validateDecision(
      {
        setId: "set-1",
        questionId: "saq-1",
        item,
        oldKeyTerms: item.keyTerms,
      },
      {
        setId: "set-1",
        questionId: "saq-1",
        keyTerms: [
          {
            originalTerm: "eukaryotic",
            term: "eukaryotic",
            definition:
              "Describes a cell whose DNA is enclosed within a membrane-bound nucleus.",
          },
          {
            originalTerm: "prokaryotic",
            term: "prokaryotic",
            definition:
              "Describes a cell whose DNA is not enclosed within a membrane-bound nucleus.",
          },
        ],
      },
    );

    expect(keyTerms.map((term) => term.term)).toEqual([
      "prokaryotic",
      "eukaryotic",
    ]);
    expect(validateShortAnswerItem({ ...item, keyTerms })).toBeNull();
  });

  it("rejects missing terms and duplicated generated definitions", () => {
    const item = legacyItem();
    const candidate = {
      setId: "set-1",
      questionId: "saq-1",
      item,
      oldKeyTerms: item.keyTerms,
    };

    expect(() =>
      validateDecision(candidate, {
        setId: "set-1",
        questionId: "saq-1",
        keyTerms: [
          {
            originalTerm: "prokaryotic",
            term: "prokaryotic",
            definition: "A sufficiently long definition.",
          },
        ],
      }),
    ).toThrow(/exactly match/);

    expect(() =>
      validateDecision(candidate, {
        setId: "set-1",
        questionId: "saq-1",
        keyTerms: [
          {
            originalTerm: "prokaryotic",
            term: "prokaryotic",
            definition: "The same generated definition.",
          },
          {
            originalTerm: "eukaryotic",
            term: "eukaryotic",
            definition: "The same generated definition.",
          },
        ],
      }),
    ).toThrow(/duplicated/);
  });

  it("rejects the reused legacy KC statement", () => {
    const item = legacyItem();

    expect(() =>
      validateDecision(
        {
          setId: "set-1",
          questionId: "saq-1",
          item,
          oldKeyTerms: item.keyTerms,
        },
        {
          setId: "set-1",
          questionId: "saq-1",
          keyTerms: [
            { originalTerm: item.keyTerms[0].term, ...item.keyTerms[0] },
            {
              originalTerm: "eukaryotic",
              term: "eukaryotic",
              definition:
                "Describes a cell whose DNA is enclosed within a membrane-bound nucleus.",
            },
          ],
        },
      ),
    ).toThrow(/legacy KC statement/);
  });

  it("allows only small spelling corrections to stored terms", () => {
    const item = legacyItem();
    item.keyTerms[0].term = "missence";

    const repaired = validateDecision(
      {
        setId: "set-1",
        questionId: "saq-1",
        item,
        oldKeyTerms: item.keyTerms,
      },
      {
        setId: "set-1",
        questionId: "saq-1",
        keyTerms: [
          {
            originalTerm: "missence",
            term: "missense",
            definition:
              "A mutation that changes a codon so it specifies a different amino acid.",
          },
          {
            originalTerm: "eukaryotic",
            term: "eukaryotic",
            definition:
              "Describes a cell whose DNA is enclosed within a membrane-bound nucleus.",
          },
        ],
      },
    );

    expect(repaired[0].term).toBe("missense");

    expect(() =>
      validateDecision(
        {
          setId: "set-1",
          questionId: "saq-1",
          item,
          oldKeyTerms: item.keyTerms,
        },
        {
          setId: "set-1",
          questionId: "saq-1",
          keyTerms: [
            {
              originalTerm: "missence",
              term: "mutation",
              definition:
                "A mutation that changes a codon so it specifies a different amino acid.",
            },
            {
              originalTerm: "eukaryotic",
              term: "eukaryotic",
              definition:
                "Describes a cell whose DNA is enclosed within a membrane-bound nucleus.",
            },
          ],
        },
      ),
    ).toThrow(/more than a spelling correction/);
  });

  it("allows a terminology repair when most original words are retained", () => {
    const item = legacyItem();
    item.keyTerms[0].term = "NADPH. Proton battery";

    const repaired = validateDecision(
      {
        setId: "set-1",
        questionId: "saq-1",
        item,
        oldKeyTerms: item.keyTerms,
      },
      {
        setId: "set-1",
        questionId: "saq-1",
        keyTerms: [
          {
            originalTerm: "NADPH. Proton battery",
            term: "NADPH; proton gradient",
            definition:
              "NADPH carries high-energy electrons, while a proton gradient stores energy across a membrane.",
          },
          {
            originalTerm: "eukaryotic",
            term: "eukaryotic",
            definition:
              "Describes a cell whose DNA is enclosed within a membrane-bound nucleus.",
          },
        ],
      },
    );

    expect(repaired.slice(0, 2).map((term) => term.term)).toEqual([
      "NADPH",
      "proton gradient",
    ]);
  });
});
