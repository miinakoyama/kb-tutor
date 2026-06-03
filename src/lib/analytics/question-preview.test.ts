import { describe, expect, it } from "vitest";
import {
  parseQuestionPreview,
  parseQuestionStandardId,
  resolveQuestionPreviews,
} from "./question-preview";

describe("parseQuestionPreview", () => {
  it("returns null when the payload is not an object", () => {
    expect(parseQuestionPreview(null)).toBeNull();
    expect(parseQuestionPreview("")).toBeNull();
    expect(parseQuestionPreview([])).toBeNull();
    expect(parseQuestionPreview(123)).toBeNull();
  });

  it("returns null when the stem is missing or blank", () => {
    expect(parseQuestionPreview({ text: "", options: [] })).toBeNull();
    expect(parseQuestionPreview({ options: [] })).toBeNull();
  });

  it("returns null when no usable options exist", () => {
    expect(
      parseQuestionPreview({ text: "Q", options: [{ text: "" }] }),
    ).toBeNull();
    expect(parseQuestionPreview({ text: "Q", options: [] })).toBeNull();
  });

  it("fills missing option ids with sequential fallbacks", () => {
    const preview = parseQuestionPreview({
      text: "Q",
      options: [{ text: "A" }, { text: "B" }],
    });
    expect(preview).not.toBeNull();
    expect(preview?.options.map((o) => o.id)).toEqual(["opt_1", "opt_2"]);
    expect(preview?.correctOptionId).toBe("opt_1");
  });

  it("preserves a valid correctOptionId", () => {
    const preview = parseQuestionPreview({
      text: "Q",
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
      correctOptionId: "b",
    });
    expect(preview?.correctOptionId).toBe("b");
  });

  it("falls back to first option when correctOptionId is missing or unknown", () => {
    const preview = parseQuestionPreview({
      text: "Q",
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
      correctOptionId: "z",
    });
    expect(preview?.correctOptionId).toBe("a");
  });

  it("keeps imageUrl when it is a non-blank string", () => {
    const preview = parseQuestionPreview({
      text: "Q",
      options: [{ id: "a", text: "A" }],
      imageUrl: "https://example.com/i.png",
    });
    expect(preview?.imageUrl).toBe("https://example.com/i.png");
  });

  it("nulls out diagram when type or data are missing", () => {
    const preview = parseQuestionPreview({
      text: "Q",
      options: [{ id: "a", text: "A" }],
      diagram: { type: "bar" },
    });
    expect(preview?.diagram).toBeNull();
  });
});

describe("parseQuestionStandardId", () => {
  it("returns the standardId when present", () => {
    expect(
      parseQuestionStandardId({ text: "Q", standardId: "3.1.9-12.A" }),
    ).toBe("3.1.9-12.A");
  });

  it("returns null when missing or blank", () => {
    expect(parseQuestionStandardId({ text: "Q" })).toBeNull();
    expect(parseQuestionStandardId({ standardId: "" })).toBeNull();
    expect(parseQuestionStandardId(null)).toBeNull();
  });
});

type StubRow = Record<string, unknown>;

function makeStubAdmin(tables: Record<string, StubRow[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.in = (col: string, values: unknown[]) => {
        const s = new Set(values);
        rows = rows.filter((r) => s.has(r[col]));
        return builder;
      };
      builder.order = () => builder;
      builder.range = () => Promise.resolve({ data: rows, error: null });
      return builder;
    },
  } as unknown as Parameters<typeof resolveQuestionPreviews>[0]["admin"];
}

const validPayload = (suffix: string) => ({
  text: `Question ${suffix}`,
  options: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
  ],
  correctOptionId: "b",
});

describe("resolveQuestionPreviews", () => {
  it("returns an empty map for empty input", async () => {
    const admin = makeStubAdmin({});
    const map = await resolveQuestionPreviews({ admin, questionIds: [] });
    expect(map.size).toBe(0);
  });

  it("reads from generated_questions only when present", async () => {
    const admin = makeStubAdmin({
      generated_questions: [
        { id: "q1", payload: validPayload("1"), updated_at: "2026-01-01" },
      ],
      assignment_question_snapshots: [],
    });
    const map = await resolveQuestionPreviews({
      admin,
      questionIds: ["q1"],
    });
    expect(map.get("q1")?.text).toBe("Question 1");
  });

  it("falls back to assignment_question_snapshots when generated_questions row missing", async () => {
    const admin = makeStubAdmin({
      generated_questions: [],
      assignment_question_snapshots: [
        {
          question_id: "q2",
          payload: validPayload("2"),
          created_at: "2026-01-02",
        },
      ],
    });
    const map = await resolveQuestionPreviews({
      admin,
      questionIds: ["q2"],
    });
    expect(map.get("q2")?.text).toBe("Question 2");
  });

  it("prefers generated_questions when both exist", async () => {
    const admin = makeStubAdmin({
      generated_questions: [
        {
          id: "q3",
          payload: validPayload("3-new"),
          updated_at: "2026-02-01",
        },
      ],
      assignment_question_snapshots: [
        {
          question_id: "q3",
          payload: validPayload("3-old"),
          created_at: "2026-01-01",
        },
      ],
    });
    const map = await resolveQuestionPreviews({
      admin,
      questionIds: ["q3"],
    });
    expect(map.get("q3")?.text).toBe("Question 3-new");
  });

  it("returns null entries for question ids without any usable payload", async () => {
    const admin = makeStubAdmin({
      generated_questions: [
        { id: "q4", payload: { text: "" }, updated_at: "2026-01-01" },
      ],
      assignment_question_snapshots: [],
    });
    const map = await resolveQuestionPreviews({
      admin,
      questionIds: ["q4", "q5"],
    });
    expect(map.get("q4")).toBeNull();
    expect(map.get("q5")).toBeNull();
  });
});
