import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadAsJson,
  downloadAsText,
  downloadAsTsv,
} from "@/lib/export-utils";
import type { Question } from "@/types/question";

function setupDownloadCapture() {
  const captured: { text: string | null; fileName: string | null } = {
    text: null,
    fileName: null,
  };
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  URL.createObjectURL = vi.fn(() => "blob:mocked") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();

  const originalAppend = document.body.appendChild.bind(document.body);
  document.body.appendChild = vi.fn(((node: Node) => {
    const anchor = node as HTMLAnchorElement;
    if (anchor.tagName === "A") {
      captured.fileName = anchor.download;
      anchor.click = vi.fn();
    }
    return originalAppend(node);
  }) as typeof document.body.appendChild);

  const originalBlob = globalThis.Blob;
  globalThis.Blob = class extends originalBlob {
    constructor(parts: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options);
      captured.text = parts.map((p) => String(p)).join("");
    }
  } as unknown as typeof Blob;

  return {
    captured,
    restore: () => {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      globalThis.Blob = originalBlob;
      document.body.appendChild = originalAppend as typeof document.body.appendChild;
    },
  };
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q-1",
    module: 1,
    topic: "Genetics",
    text: "What is the probability of inheriting a trait?",
    imageUrl: null,
    options: [
      { id: "A", text: "50%", feedback: "wrong" },
      { id: "B", text: "25%", feedback: "correct" },
    ],
    correctOptionId: "B",
    source: "manual",
    ...overrides,
  };
}

let harness: ReturnType<typeof setupDownloadCapture>;

beforeEach(() => {
  harness = setupDownloadCapture();
});

afterEach(() => {
  harness.restore();
});

describe("downloadAsJson", () => {
  it("writes a JSON array of sanitized questions", () => {
    downloadAsJson([makeQuestion()], "bank");
    expect(harness.captured.fileName).toBe("bank.json");
    const parsed = JSON.parse(harness.captured.text ?? "[]") as Question[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].text).toContain("probability");
  });

  it("strips LaTeX delimiters from question text and options", () => {
    downloadAsJson(
      [
        makeQuestion({
          text: "Energy is $E = mc^2$",
          options: [
            { id: "A", text: "$\\alpha$", feedback: undefined },
            { id: "B", text: "$\\beta$", feedback: undefined },
          ],
        }),
      ],
      "bank",
    );
    const parsed = JSON.parse(harness.captured.text ?? "[]") as Question[];
    expect(parsed[0].text).toBe("Energy is E = mc^2");
    expect(parsed[0].options[0].text).toBe("\\alpha");
  });
});

describe("downloadAsTsv", () => {
  it("writes a header row and one row per question", () => {
    downloadAsTsv([makeQuestion()], "bank");
    expect(harness.captured.fileName).toBe("bank.tsv");
    const lines = (harness.captured.text ?? "").split("\n");
    expect(lines[0].startsWith("id\t")).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("q-1");
  });

  it("escapes values that contain tabs, newlines, or quotes", () => {
    downloadAsTsv(
      [
        makeQuestion({
          text: 'has\ttab and\nnewline and "quote"',
        }),
      ],
      "bank",
    );
    const text = harness.captured.text ?? "";
    expect(text).toContain('"has\ttab and\nnewline and ""quote"""');
  });
});

describe("downloadAsText", () => {
  it("emits a human-readable text dump with question numbers", () => {
    downloadAsText([makeQuestion(), makeQuestion({ id: "q-2" })], "bank");
    expect(harness.captured.fileName).toBe("bank.txt");
    const text = harness.captured.text ?? "";
    expect(text).toContain("Question 1");
    expect(text).toContain("Question 2");
    expect(text).toContain("Correct Answer: B");
  });
});
