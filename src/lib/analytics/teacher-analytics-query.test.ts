import { describe, expect, it } from "vitest";
import {
  attemptModesFromFilter,
  parseTeacherAnalyticsQuery,
} from "./teacher-analytics-query";

function parse(qs: string) {
  return parseTeacherAnalyticsQuery(new URL(`https://example.com/?${qs}`));
}

describe("parseTeacherAnalyticsQuery", () => {
  it("returns defaults for an empty query string", () => {
    const result = parse("");
    if (!result.ok) throw new Error(result.error);
    expect(result.query).toEqual({
      range: "30d",
      mode: "compare",
      source: "all",
      classId: null,
      studentId: null,
      topic: null,
      scope: "selected",
      assignmentId: null,
      standardIdFilter: null,
      chartView: "rolling",
      cursor: null,
      sampleMode: "random",
      seed: null,
      skip: 0,
    });
  });

  it("parses every enum and string field", () => {
    const result = parse(
      [
        "range=7d",
        "mode=practice",
        "source=assigned",
        "classId=sch_a",
        "studentId=stu_1",
        "topic=Cells",
        "scope=all",
        "assignmentId=asg_1",
        "standardId=3.1.9-12.A",
        "chartView=cumulative",
        "cursor=2026-05-22T08:00:00Z",
        "sampleMode=high_accuracy_first",
        "seed=abcd1234",
        "skip=2",
      ].join("&"),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.query).toMatchObject({
      range: "7d",
      mode: "practice",
      source: "assigned",
      classId: "sch_a",
      studentId: "stu_1",
      topic: "Cells",
      scope: "all",
      assignmentId: "asg_1",
      standardIdFilter: "3.1.9-12.A",
      chartView: "cumulative",
      cursor: "2026-05-22T08:00:00Z",
      sampleMode: "high_accuracy_first",
      seed: "abcd1234",
      skip: 2,
    });
  });

  it("rejects invalid range", () => {
    const result = parse("range=99d");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Invalid query: range");
  });

  it("rejects invalid mode", () => {
    const result = parse("mode=fast");
    expect(result.ok).toBe(false);
  });

  it("rejects invalid source", () => {
    const result = parse("source=teacher");
    expect(result.ok).toBe(false);
  });

  it("rejects invalid scope", () => {
    const result = parse("scope=elevated");
    expect(result.ok).toBe(false);
  });

  it("rejects invalid sampleMode", () => {
    const result = parse("sampleMode=alphabetical");
    expect(result.ok).toBe(false);
  });

  it("rejects invalid chartView", () => {
    const result = parse("chartView=pie");
    expect(result.ok).toBe(false);
  });

  it("rejects invalid seed (too short, special chars, too long)", () => {
    expect(parse("seed=abc").ok).toBe(false);
    expect(parse("seed=ab cd").ok).toBe(false);
    expect(parse("seed=" + "x".repeat(65)).ok).toBe(false);
  });

  it("accepts valid seeds (length 4..64, dot/dash/colon allowed)", () => {
    const r = parse("seed=AB12-cd.ef:99");
    if (!r.ok) throw new Error(r.error);
    expect(r.query.seed).toBe("AB12-cd.ef:99");
  });

  it("rejects negative or non-integer skip", () => {
    expect(parse("skip=-1").ok).toBe(false);
    expect(parse("skip=1.5").ok).toBe(false);
    expect(parse("skip=abc").ok).toBe(false);
  });

  it("treats empty-string params the same as missing", () => {
    const result = parse("classId=&studentId=");
    if (!result.ok) throw new Error(result.error);
    expect(result.query.classId).toBeNull();
    expect(result.query.studentId).toBeNull();
  });
});

describe("attemptModesFromFilter", () => {
  it("expands compare and all to every attempt mode", () => {
    expect(attemptModesFromFilter("compare").sort()).toEqual([
      "exam",
      "practice",
      "review",
    ]);
    expect(attemptModesFromFilter("all").sort()).toEqual([
      "exam",
      "practice",
      "review",
    ]);
  });

  it("narrows to a single mode for concrete filters", () => {
    expect(attemptModesFromFilter("practice")).toEqual(["practice"]);
    expect(attemptModesFromFilter("exam")).toEqual(["exam"]);
    expect(attemptModesFromFilter("review")).toEqual(["review"]);
  });
});
