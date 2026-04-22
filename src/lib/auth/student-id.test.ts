import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  normalizeStudentId,
  normalizeStudentIdValidationRule,
  studentIdToLoginEmail,
  validateStudentIdAgainstRule,
} from "@/lib/auth/student-id";

const ORIGINAL = process.env.STUDENT_LOGIN_DOMAIN;

describe("normalizeStudentId", () => {
  it("trims whitespace and lowercases the id", () => {
    expect(normalizeStudentId("  Alice01 ")).toBe("alice01");
  });

  it("returns an empty string when given whitespace only", () => {
    expect(normalizeStudentId("   ")).toBe("");
  });

  it("leaves already-normalized ids unchanged", () => {
    expect(normalizeStudentId("abc123")).toBe("abc123");
  });
});

describe("normalizeStudentIdValidationRule", () => {
  it("normalizes empty values to null", () => {
    expect(normalizeStudentIdValidationRule({ pattern: "  ", hint: " " })).toEqual({
      pattern: null,
      hint: null,
    });
  });

  it("trims configured values", () => {
    expect(
      normalizeStudentIdValidationRule({
        pattern: "  ^st\\d{9}$ ",
        hint: " Example: st004720601 ",
      }),
    ).toEqual({
      pattern: "^st\\d{9}$",
      hint: "Example: st004720601",
    });
  });
});

describe("validateStudentIdAgainstRule", () => {
  it("accepts all IDs when no pattern is configured", () => {
    expect(
      validateStudentIdAgainstRule("st123", {
        pattern: null,
      }),
    ).toEqual({ isValid: true, reason: null });
  });

  it("rejects IDs that do not match configured pattern", () => {
    expect(
      validateStudentIdAgainstRule("alice", {
        pattern: "^st\\d{9}$",
        hint: "Example: st004720601",
      }),
    ).toEqual({
      isValid: false,
      reason: "Invalid student ID format. Example: st004720601",
    });
  });

  it("accepts IDs that match the configured pattern", () => {
    expect(
      validateStudentIdAgainstRule("st004720601", {
        pattern: "^st\\d{9}$",
      }),
    ).toEqual({ isValid: true, reason: null });
  });

  it("returns a configuration error when regex is invalid", () => {
    expect(
      validateStudentIdAgainstRule("st004720601", {
        pattern: "[invalid",
      }),
    ).toEqual({
      isValid: false,
      reason: "This school's student ID format is not configured correctly.",
    });
  });
});

describe("studentIdToLoginEmail", () => {
  beforeEach(() => {
    delete process.env.STUDENT_LOGIN_DOMAIN;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.STUDENT_LOGIN_DOMAIN;
    } else {
      process.env.STUDENT_LOGIN_DOMAIN = ORIGINAL;
    }
  });

  it("returns the raw email when input already contains '@'", () => {
    expect(studentIdToLoginEmail("Alice@example.com")).toBe("alice@example.com");
  });

  it("falls back to the default domain when env is unset", () => {
    const email = studentIdToLoginEmail("alice01");
    expect(email.startsWith("alice01@")).toBe(true);
    expect(email.split("@").length).toBe(2);
  });

  it("uses the configured domain from STUDENT_LOGIN_DOMAIN", () => {
    process.env.STUDENT_LOGIN_DOMAIN = "school.example.com";
    expect(studentIdToLoginEmail("alice01")).toBe(
      "alice01@school.example.com",
    );
  });

  it("lowercases the configured domain", () => {
    process.env.STUDENT_LOGIN_DOMAIN = "  School.Example.Com ";
    expect(studentIdToLoginEmail("alice01")).toBe(
      "alice01@school.example.com",
    );
  });
});
