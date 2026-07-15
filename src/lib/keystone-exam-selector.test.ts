import { describe, expect, it } from "vitest";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";
import { getStudentKeystoneExam } from "@/lib/keystone-exam";

const NOW = new Date("2026-04-20T00:00:00.000Z");

function memberRow(
  schoolId: string,
  name: string,
  examDate: string | null,
  studentUserId = "student-1",
) {
  return {
    school_id: schoolId,
    student_user_id: studentUserId,
    schools: { id: schoolId, name, keystone_exam_date: examDate },
  };
}

function makeSupabase({
  members = [] as Array<Record<string, unknown>>,
  membersError = null as { message: string } | null,
  personalDate = null as string | null,
} = {}) {
  return createMockSupabaseClient({
    tables: {
      school_members: { rows: members, error: membersError },
      user_settings:
        personalDate === null
          ? { rows: [] }
          : {
              rows: [{ user_id: "student-1", keystone_exam_date: personalDate }],
            },
    },
  }).client;
}

describe("getStudentKeystoneExam", () => {
  it("returns null when the student has no enrolled schools", async () => {
    const supabase = makeSupabase();
    const result = await getStudentKeystoneExam(supabase, "student-1");
    expect(result).toBeNull();
  });

  it("returns null on query error", async () => {
    const supabase = makeSupabase({ membersError: { message: "RLS" } });
    const result = await getStudentKeystoneExam(supabase, "student-1");
    expect(result).toBeNull();
  });

  it("returns null when no enrolled school has an exam date configured", async () => {
    const supabase = makeSupabase({
      members: [memberRow("s1", "School One", null)],
    });
    const result = await getStudentKeystoneExam(supabase, "student-1");
    expect(result).toBeNull();
  });

  it("skips exams that are already in the past", async () => {
    const supabase = makeSupabase({
      members: [memberRow("s1", "Past", "2026-01-01")],
    });
    const result = await getStudentKeystoneExam(supabase, "student-1", { now: NOW });
    expect(result).toBeNull();
  });

  it("returns the nearest upcoming exam when multiple schools have dates", async () => {
    const supabase = makeSupabase({
      members: [
        memberRow("s1", "Earlier", "2026-05-10"),
        memberRow("s2", "Later", "2026-06-01"),
      ],
    });
    const result = await getStudentKeystoneExam(supabase, "student-1", { now: NOW });
    expect(result?.schoolId).toBe("s1");
    expect(result?.examDate).toBe("2026-05-10");
    expect(result?.source).toBe("school");
  });

  it("handles the join payload arriving as an array", async () => {
    const supabase = makeSupabase({
      members: [
        {
          school_id: "s1",
          student_user_id: "student-1",
          schools: [
            { id: "s1", name: "Array Shape", keystone_exam_date: "2026-05-10" },
          ],
        },
      ],
    });
    const result = await getStudentKeystoneExam(supabase, "student-1", { now: NOW });
    expect(result?.examDate).toBe("2026-05-10");
  });

  it("prefers the student's personal date over the school date", async () => {
    const supabase = makeSupabase({
      members: [memberRow("s1", "School One", "2026-05-10")],
      personalDate: "2026-06-15",
    });
    const result = await getStudentKeystoneExam(supabase, "student-1", { now: NOW });
    expect(result?.examDate).toBe("2026-06-15");
    expect(result?.source).toBe("personal");
    expect(result?.schoolId).toBeNull();
  });

  it("uses a personal date even when no school has one", async () => {
    const supabase = makeSupabase({ personalDate: "2026-06-15" });
    const result = await getStudentKeystoneExam(supabase, "student-1", { now: NOW });
    expect(result?.examDate).toBe("2026-06-15");
    expect(result?.source).toBe("personal");
  });

  it("ignores a personal date that is already in the past", async () => {
    const supabase = makeSupabase({
      members: [memberRow("s1", "School One", "2026-05-10")],
      personalDate: "2026-01-01",
    });
    const result = await getStudentKeystoneExam(supabase, "student-1", { now: NOW });
    expect(result?.examDate).toBe("2026-05-10");
    expect(result?.source).toBe("school");
  });

  it("ignores a malformed personal date", async () => {
    const supabase = makeSupabase({
      members: [memberRow("s1", "School One", "2026-05-10")],
      personalDate: "2026-02-31",
    });
    const result = await getStudentKeystoneExam(supabase, "student-1", { now: NOW });
    expect(result?.examDate).toBe("2026-05-10");
    expect(result?.source).toBe("school");
  });
});
