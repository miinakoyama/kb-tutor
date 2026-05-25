import { describe, expect, it } from "vitest";
import { listBankQuestionsForStandard } from "./standard-bank";

type Row = Record<string, unknown>;

function makeStubAdmin(rows: Row[]) {
  return {
    from() {
      const filters: Array<(row: Row) => boolean> = [];
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      };
      builder.order = () => builder;
      builder.range = () =>
        Promise.resolve({
          data: rows.filter((r) => filters.every((f) => f(r))),
          error: null,
        });
      return builder;
    },
  } as unknown as Parameters<typeof listBankQuestionsForStandard>[0]["admin"];
}

describe("listBankQuestionsForStandard", () => {
  it("returns ids of bank questions whose payload.standardId matches", async () => {
    const admin = makeStubAdmin([
      { id: "q1", payload: { text: "Q", standardId: "S1" } },
      { id: "q2", payload: { text: "Q", standardId: "S1" } },
      { id: "q3", payload: { text: "Q", standardId: "S2" } },
      { id: "q4", payload: { text: "Q" } },
    ]);
    const ids = await listBankQuestionsForStandard({
      admin,
      standardId: "S1",
    });
    expect(ids.sort()).toEqual(["q1", "q2"]);
  });

  it("deduplicates ids that appear multiple times in the result set", async () => {
    const admin = makeStubAdmin([
      { id: "q1", payload: { text: "Q", standardId: "S1" } },
      { id: "q1", payload: { text: "Q (older)", standardId: "S1" } },
      { id: "q2", payload: { text: "Q", standardId: "S1" } },
    ]);
    const ids = await listBankQuestionsForStandard({
      admin,
      standardId: "S1",
    });
    expect(ids).toEqual(["q1", "q2"]);
  });

  it("returns an empty array when no rows match the standard", async () => {
    const admin = makeStubAdmin([
      { id: "q1", payload: { text: "Q", standardId: "S2" } },
    ]);
    const ids = await listBankQuestionsForStandard({
      admin,
      standardId: "S1",
    });
    expect(ids).toEqual([]);
  });
});
