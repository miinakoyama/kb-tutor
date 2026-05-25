import { describe, expect, it } from "vitest";
import { resolveTeacherScope } from "./teacher-scope";

type Row = Record<string, unknown>;
type TableData = Row[];

type FilterStep =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "in"; column: string; values: unknown[] }
  | { kind: "order"; column: string; ascending: boolean }
  | { kind: "range"; from: number; to: number }
  | { kind: "select"; columns: string };

function applyFilters(rows: TableData, filters: FilterStep[]): TableData {
  let working = [...rows];
  for (const step of filters) {
    if (step.kind === "eq") {
      working = working.filter((row) => row[step.column] === step.value);
    } else if (step.kind === "in") {
      const set = new Set(step.values);
      working = working.filter((row) => set.has(row[step.column]));
    } else if (step.kind === "order") {
      working.sort((a, b) => {
        const av = a[step.column];
        const bv = b[step.column];
        if (av === bv) return 0;
        const cmp = String(av) < String(bv) ? -1 : 1;
        return step.ascending ? cmp : -cmp;
      });
    } else if (step.kind === "range") {
      working = working.slice(step.from, step.to + 1);
    }
  }
  return working;
}

function makeBuilder(table: string, db: Record<string, TableData>) {
  const filters: FilterStep[] = [];
  const builder: Record<string, unknown> = {};
  builder.select = (columns: string) => {
    filters.push({ kind: "select", columns });
    return builder;
  };
  builder.eq = (column: string, value: unknown) => {
    filters.push({ kind: "eq", column, value });
    return builder;
  };
  builder.in = (column: string, values: unknown[]) => {
    filters.push({ kind: "in", column, values });
    return builder;
  };
  builder.order = (column: string, opts?: { ascending?: boolean }) => {
    filters.push({
      kind: "order",
      column,
      ascending: opts?.ascending !== false,
    });
    return builder;
  };
  builder.range = (from: number, to: number) => {
    filters.push({ kind: "range", from, to });
    const data = applyFilters(db[table] ?? [], filters);
    return Promise.resolve({ data, error: null });
  };
  builder.maybeSingle = () => {
    const data = applyFilters(db[table] ?? [], filters);
    return Promise.resolve({ data: data[0] ?? null, error: null });
  };
  // Default await behavior: when caller does not chain .range, resolve immediately.
  builder.then = (
    onFulfilled: (value: { data: TableData; error: null }) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => {
    const data = applyFilters(db[table] ?? [], filters);
    return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
  };
  return builder;
}

function makeStubAdmin(db: Record<string, TableData>) {
  return {
    from(table: string) {
      return makeBuilder(table, db);
    },
  } as unknown as Parameters<typeof resolveTeacherScope>[0]["admin"];
}

describe("resolveTeacherScope", () => {
  it("returns the teacher's schools, classes, and students excluding excluded_from_analytics", async () => {
    const admin = makeStubAdmin({
      school_teachers: [
        { teacher_user_id: "t1", school_id: "sch_a" },
        { teacher_user_id: "t1", school_id: "sch_b" },
      ],
      schools: [
        { id: "sch_a", name: "North High", teacher_user_id: null },
        { id: "sch_b", name: "South High", teacher_user_id: null },
        { id: "sch_c", name: "West High", teacher_user_id: null },
      ],
      school_members: [
        { school_id: "sch_a", student_user_id: "stu_1" },
        { school_id: "sch_a", student_user_id: "stu_2" },
        { school_id: "sch_b", student_user_id: "stu_3" },
        { school_id: "sch_c", student_user_id: "stu_outside" },
      ],
      profiles: [
        {
          id: "stu_1",
          display_name: "Alice",
          student_id: "S1",
          excluded_from_analytics: false,
        },
        {
          id: "stu_2",
          display_name: null,
          student_id: "S2",
          excluded_from_analytics: false,
        },
        {
          id: "stu_3",
          display_name: "Carlos",
          student_id: "S3",
          excluded_from_analytics: true,
        },
      ],
    });

    const scope = await resolveTeacherScope({
      admin,
      userId: "t1",
      role: "teacher",
    });

    expect(scope.schoolIds.sort()).toEqual(["sch_a", "sch_b"]);
    expect(scope.classes.map((c) => c.id).sort()).toEqual(["sch_a", "sch_b"]);
    expect(scope.studentIds.sort()).toEqual(["stu_1", "stu_2"]);
    expect(scope.studentMap.get("stu_1")?.label).toBe("Alice");
    expect(scope.studentMap.get("stu_2")?.label).toBe("S2");
    expect(scope.studentMap.has("stu_3")).toBe(false);
    expect(scope.studentMap.has("stu_outside")).toBe(false);
  });

  it("includes legacy schools.teacher_user_id ownership", async () => {
    const admin = makeStubAdmin({
      school_teachers: [],
      schools: [
        { id: "sch_legacy", name: "Legacy School", teacher_user_id: "t2" },
      ],
      school_members: [
        { school_id: "sch_legacy", student_user_id: "stu_lg" },
      ],
      profiles: [
        {
          id: "stu_lg",
          display_name: "Legacy Student",
          student_id: "L1",
          excluded_from_analytics: false,
        },
      ],
    });

    const scope = await resolveTeacherScope({
      admin,
      userId: "t2",
      role: "teacher",
    });
    expect(scope.schoolIds).toEqual(["sch_legacy"]);
    expect(scope.studentIds).toEqual(["stu_lg"]);
  });

  it("returns empty arrays when the teacher has no schools", async () => {
    const admin = makeStubAdmin({
      school_teachers: [],
      schools: [],
      school_members: [],
      profiles: [],
    });
    const scope = await resolveTeacherScope({
      admin,
      userId: "t3",
      role: "teacher",
    });
    expect(scope.schoolIds).toEqual([]);
    expect(scope.studentIds).toEqual([]);
    expect(scope.studentMap.size).toBe(0);
  });

  it("for role=admin defaults to every school", async () => {
    const admin = makeStubAdmin({
      schools: [
        { id: "sch_a", name: "A", teacher_user_id: null },
        { id: "sch_b", name: "B", teacher_user_id: null },
      ],
      school_members: [
        { school_id: "sch_a", student_user_id: "stu_a" },
        { school_id: "sch_b", student_user_id: "stu_b" },
      ],
      profiles: [
        {
          id: "stu_a",
          display_name: "A",
          student_id: "A",
          excluded_from_analytics: false,
        },
        {
          id: "stu_b",
          display_name: "B",
          student_id: "B",
          excluded_from_analytics: false,
        },
      ],
    });
    const scope = await resolveTeacherScope({
      admin,
      userId: "admin_user",
      role: "admin",
    });
    expect(scope.schoolIds.sort()).toEqual(["sch_a", "sch_b"]);
    expect(scope.studentIds.sort()).toEqual(["stu_a", "stu_b"]);
  });

  it("downgrades scopeMode='all' to 'selected' for teachers (no escalation)", async () => {
    const admin = makeStubAdmin({
      school_teachers: [{ teacher_user_id: "t1", school_id: "sch_a" }],
      schools: [
        { id: "sch_a", name: "A", teacher_user_id: null },
        { id: "sch_b", name: "B", teacher_user_id: null },
      ],
      school_members: [
        { school_id: "sch_a", student_user_id: "stu_a" },
        { school_id: "sch_b", student_user_id: "stu_b" },
      ],
      profiles: [
        {
          id: "stu_a",
          display_name: "A",
          student_id: "A",
          excluded_from_analytics: false,
        },
        {
          id: "stu_b",
          display_name: "B",
          student_id: "B",
          excluded_from_analytics: false,
        },
      ],
    });
    const scope = await resolveTeacherScope({
      admin,
      userId: "t1",
      role: "teacher",
      scopeMode: "all",
    });
    expect(scope.schoolIds).toEqual(["sch_a"]);
    expect(scope.studentIds).toEqual(["stu_a"]);
  });

  it("applies classIdFilter only when it is one of the caller's schools", async () => {
    const admin = makeStubAdmin({
      school_teachers: [
        { teacher_user_id: "t1", school_id: "sch_a" },
        { teacher_user_id: "t1", school_id: "sch_b" },
      ],
      schools: [
        { id: "sch_a", name: "A", teacher_user_id: null },
        { id: "sch_b", name: "B", teacher_user_id: null },
        { id: "sch_c", name: "C", teacher_user_id: null },
      ],
      school_members: [
        { school_id: "sch_a", student_user_id: "stu_a" },
        { school_id: "sch_b", student_user_id: "stu_b" },
        { school_id: "sch_c", student_user_id: "stu_c" },
      ],
      profiles: [
        {
          id: "stu_a",
          display_name: "A",
          student_id: "A",
          excluded_from_analytics: false,
        },
        {
          id: "stu_b",
          display_name: "B",
          student_id: "B",
          excluded_from_analytics: false,
        },
        {
          id: "stu_c",
          display_name: "C",
          student_id: "C",
          excluded_from_analytics: false,
        },
      ],
    });

    const filteredIn = await resolveTeacherScope({
      admin,
      userId: "t1",
      role: "teacher",
      classIdFilter: "sch_a",
    });
    expect(filteredIn.studentIds).toEqual(["stu_a"]);

    const filteredOut = await resolveTeacherScope({
      admin,
      userId: "t1",
      role: "teacher",
      classIdFilter: "sch_c",
    });
    expect(filteredOut.studentIds.sort()).toEqual(["stu_a", "stu_b"]);
  });
});
