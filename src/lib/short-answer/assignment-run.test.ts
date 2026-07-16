import { describe, expect, it } from "vitest";
import {
  applyAssignmentRunFilter,
  applyQuestionSetFilter,
} from "./assignment-run";

describe("applyAssignmentRunFilter", () => {
  it("filters first-run assignment attempts with IS NULL", () => {
    const calls: string[] = [];
    const query = {
      eq: (col: string, val: string) => {
        calls.push(`eq:${col}=${val}`);
        return query;
      },
      is: (col: string, val: null) => {
        calls.push(`is:${col}=${String(val)}`);
        return query;
      },
      gt: (col: string, val: string) => {
        calls.push(`gt:${col}=${val}`);
        return query;
      },
    };

    applyAssignmentRunFilter(query, "as_1", null);
    expect(calls).toEqual(["is:assignment_run_after=null"]);
  });

  it("filters retry-run assignment attempts using answered_at after completion", () => {
    const calls: string[] = [];
    const query = {
      eq: (col: string, val: string) => {
        calls.push(`eq:${col}=${val}`);
        return query;
      },
      is: (col: string, val: null) => {
        calls.push(`is:${col}=${String(val)}`);
        return query;
      },
      gt: (col: string, val: string) => {
        calls.push(`gt:${col}=${val}`);
        return query;
      },
    };

    applyAssignmentRunFilter(query, "as_1", "2026-04-20T10:00:00.000Z");
    expect(calls).toEqual(["gt:answered_at=2026-04-20T10:00:00.000Z"]);
  });

  it("does not filter self-practice rows without an assignment id", () => {
    const calls: string[] = [];
    const query = {
      eq: (col: string, val: string) => {
        calls.push(`eq:${col}=${val}`);
        return query;
      },
      is: (col: string, val: null) => {
        calls.push(`is:${col}=${String(val)}`);
        return query;
      },
      gt: (col: string, val: string) => {
        calls.push(`gt:${col}=${val}`);
        return query;
      },
    };

    applyAssignmentRunFilter(query, null, null);
    expect(calls).toEqual([]);
  });
});

describe("applyQuestionSetFilter", () => {
  function queryWithCalls(calls: string[]) {
    const query = {
      eq: (col: string, val: string) => {
        calls.push(`eq:${col}=${val}`);
        return query;
      },
      is: (col: string, val: null) => {
        calls.push(`is:${col}=${String(val)}`);
        return query;
      },
    };
    return query;
  }

  it("matches the exact generated question set", () => {
    const calls: string[] = [];
    applyQuestionSetFilter(queryWithCalls(calls), "set-b");
    expect(calls).toEqual(["eq:question_set_id=set-b"]);
  });

  it("keeps manual and legacy attempts in the unscoped identity", () => {
    const calls: string[] = [];
    applyQuestionSetFilter(queryWithCalls(calls), null);
    expect(calls).toEqual(["is:question_set_id=null"]);
  });
});
