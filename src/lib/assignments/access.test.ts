import { describe, expect, it } from "vitest";
import { canStudentAccessAssignment } from "./access";

function makeAdmin(tables: Record<string, unknown>) {
  return {
    from: (table: string) => {
      const state = tables[table] as
        | { data?: unknown; error?: { message: string } | null }
        | undefined;
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.maybeSingle = async () => ({
        data: state?.data ?? null,
        error: state?.error ?? null,
      });
      return builder;
    },
  };
}

describe("canStudentAccessAssignment", () => {
  it("allows a student with an assignment_targets row", async () => {
    const admin = makeAdmin({
      assignments: { data: { school_id: "school-1" } },
      assignment_targets: { data: { assignment_id: "asg-1" } },
    });
    await expect(
      canStudentAccessAssignment(admin as never, "student-1", "asg-1"),
    ).resolves.toBe(true);
  });

  it("allows a school member without a targets row", async () => {
    const admin = makeAdmin({
      assignments: { data: { school_id: "school-1" } },
      assignment_targets: { data: null },
      school_members: { data: { school_id: "school-1" } },
    });
    await expect(
      canStudentAccessAssignment(admin as never, "student-1", "asg-1"),
    ).resolves.toBe(true);
  });

  it("denies when assignment is missing or student has no access", async () => {
    const admin = makeAdmin({
      assignments: { data: null },
    });
    await expect(
      canStudentAccessAssignment(admin as never, "student-1", "asg-1"),
    ).resolves.toBe(false);

    const noMember = makeAdmin({
      assignments: { data: { school_id: "school-1" } },
      assignment_targets: { data: null },
      school_members: { data: null },
    });
    await expect(
      canStudentAccessAssignment(noMember as never, "student-1", "asg-1"),
    ).resolves.toBe(false);
  });
});
