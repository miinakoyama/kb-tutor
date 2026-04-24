import { describe, expect, it } from "vitest";
import { createMockSupabaseClient } from "@/test-utils/supabase-mock";
import {
  countIncompleteEnrolledAssignmentsForStudent,
  countIncompleteSchoolAssignmentsForStudent,
} from "@/lib/assignment-school-completion";

describe("countIncompleteSchoolAssignmentsForStudent", () => {
  it("returns total and zero incomplete when every assignment has last_completed_at", async () => {
    const { client } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [
            { id: "a1", school_id: "s1" },
            { id: "a2", school_id: "s1" },
          ],
        },
        assignment_targets: {
          rows: [
            {
              assignment_id: "a1",
              student_user_id: "u1",
              last_completed_at: "2026-04-01T00:00:00.000Z",
            },
            {
              assignment_id: "a2",
              student_user_id: "u1",
              last_completed_at: "2026-04-02T00:00:00.000Z",
            },
          ],
        },
      },
    });
    const result = await countIncompleteSchoolAssignmentsForStudent(client, "s1", "u1");
    expect(result.error).toBeNull();
    expect(result.total).toBe(2);
    expect(result.incomplete).toBe(0);
  });

  it("counts missing target row as incomplete", async () => {
    const { client } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [{ id: "a1", school_id: "s1" }],
        },
        assignment_targets: { rows: [] },
      },
    });
    const result = await countIncompleteSchoolAssignmentsForStudent(client, "s1", "u1");
    expect(result.error).toBeNull();
    expect(result.total).toBe(1);
    expect(result.incomplete).toBe(1);
  });

  it("counts null last_completed_at as incomplete", async () => {
    const { client } = createMockSupabaseClient({
      tables: {
        assignments: {
          rows: [{ id: "a1", school_id: "s1" }],
        },
        assignment_targets: {
          rows: [
            {
              assignment_id: "a1",
              student_user_id: "u1",
              last_completed_at: null,
            },
          ],
        },
      },
    });
    const result = await countIncompleteSchoolAssignmentsForStudent(client, "s1", "u1");
    expect(result.error).toBeNull();
    expect(result.incomplete).toBe(1);
  });
});


describe("countIncompleteEnrolledAssignmentsForStudent", () => {
  it("counts incomplete assignments across all enrolled schools", async () => {
    const { client } = createMockSupabaseClient({
      tables: {
        school_members: {
          rows: [
            { school_id: "s1", student_user_id: "u1" },
            { school_id: "s2", student_user_id: "u1" },
          ],
        },
        assignments: {
          rows: [
            { id: "a1", school_id: "s1" },
            { id: "a2", school_id: "s2" },
          ],
        },
        assignment_targets: {
          rows: [
            {
              assignment_id: "a1",
              student_user_id: "u1",
              last_completed_at: "2026-04-02T00:00:00.000Z",
            },
            {
              assignment_id: "a2",
              student_user_id: "u1",
              last_completed_at: null,
            },
          ],
        },
      },
    });

    const result = await countIncompleteEnrolledAssignmentsForStudent(client, "u1");
    expect(result.error).toBeNull();
    expect(result.total).toBe(2);
    expect(result.incomplete).toBe(1);
  });

  it("returns zeroes when the student has no school memberships", async () => {
    const { client } = createMockSupabaseClient({
      tables: {
        school_members: { rows: [] },
        assignments: { rows: [{ id: "a1", school_id: "s1" }] },
      },
    });

    const result = await countIncompleteEnrolledAssignmentsForStudent(client, "u1");
    expect(result.error).toBeNull();
    expect(result.total).toBe(0);
    expect(result.incomplete).toBe(0);
  });
});
