import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  parseRole,
  resolveMetadataRole,
  resolveProfileRole,
  resolveRole,
} from "@/lib/auth/role";

function makeUser(overrides: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): Pick<User, "app_metadata" | "user_metadata"> {
  return {
    user_metadata: overrides.user_metadata ?? {},
    app_metadata: overrides.app_metadata ?? {},
  } as Pick<User, "app_metadata" | "user_metadata">;
}

describe("parseRole", () => {
  it("returns 'student', 'teacher', or 'admin' for valid role strings", () => {
    expect(parseRole("student")).toBe("student");
    expect(parseRole("teacher")).toBe("teacher");
    expect(parseRole("admin")).toBe("admin");
  });

  it("returns null for unknown roles", () => {
    expect(parseRole("super-admin")).toBeNull();
    expect(parseRole("")).toBeNull();
    expect(parseRole("STUDENT")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(parseRole(null)).toBeNull();
    expect(parseRole(undefined)).toBeNull();
    expect(parseRole(42)).toBeNull();
    expect(parseRole({ role: "student" })).toBeNull();
  });
});

describe("resolveProfileRole", () => {
  it("accepts valid role strings", () => {
    expect(resolveProfileRole("teacher")).toBe("teacher");
  });

  it("returns null when the profile role is missing or invalid", () => {
    expect(resolveProfileRole(null)).toBeNull();
    expect(resolveProfileRole(undefined)).toBeNull();
    expect(resolveProfileRole("owner")).toBeNull();
  });
});

describe("resolveMetadataRole", () => {
  it("prefers user_metadata over app_metadata", () => {
    const user = makeUser({
      user_metadata: { role: "teacher" },
      app_metadata: { role: "admin" },
    });
    expect(resolveMetadataRole(user)).toBe("teacher");
  });

  it("falls back to app_metadata when user_metadata is missing", () => {
    const user = makeUser({ app_metadata: { role: "admin" } });
    expect(resolveMetadataRole(user)).toBe("admin");
  });

  it("returns null when both metadata locations are empty", () => {
    expect(resolveMetadataRole(makeUser({}))).toBeNull();
  });

  it("returns null when metadata contains an invalid role", () => {
    const user = makeUser({ user_metadata: { role: "superuser" } });
    expect(resolveMetadataRole(user)).toBeNull();
  });
});

describe("resolveRole", () => {
  it("returns the profile role first when valid", () => {
    const user = makeUser({ user_metadata: { role: "admin" } });
    expect(resolveRole("student", user)).toBe("student");
  });

  it("falls back to metadata when the profile role is invalid", () => {
    const user = makeUser({ user_metadata: { role: "teacher" } });
    expect(resolveRole(null, user)).toBe("teacher");
    expect(resolveRole("bogus", user)).toBe("teacher");
  });

  it("returns null when neither source yields a valid role", () => {
    const user = makeUser({});
    expect(resolveRole(null, user)).toBeNull();
  });
});
