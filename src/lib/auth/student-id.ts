const DEFAULT_LOGIN_DOMAIN = "student.local";

export interface StudentIdValidationRule {
  pattern: string | null;
  hint: string | null;
}

export function normalizeStudentId(input: string): string {
  return input.trim().toLowerCase();
}

export function normalizeStudentIdValidationRule(
  rule: Partial<StudentIdValidationRule> | null | undefined,
): StudentIdValidationRule {
  const normalizedPattern = typeof rule?.pattern === "string" ? rule.pattern.trim() : "";
  const normalizedHint = typeof rule?.hint === "string" ? rule.hint.trim() : "";

  return {
    pattern: normalizedPattern || null,
    hint: normalizedHint || null,
  };
}

export function validateStudentIdAgainstRule(
  studentId: string,
  rule: Partial<StudentIdValidationRule> | null | undefined,
): { isValid: boolean; reason: string | null } {
  const normalized = normalizeStudentId(studentId);
  if (!normalized) {
    return { isValid: false, reason: "Please enter your student ID." };
  }

  const normalizedRule = normalizeStudentIdValidationRule(rule);
  if (!normalizedRule.pattern) {
    return { isValid: true, reason: null };
  }

  let regex: RegExp;
  try {
    regex = new RegExp(normalizedRule.pattern);
  } catch {
    return {
      isValid: false,
      reason: "This school's student ID format is not configured correctly.",
    };
  }

  const isMatch = regex.test(normalized);
  if (isMatch) {
    return { isValid: true, reason: null };
  }

  if (normalizedRule.hint) {
    return { isValid: false, reason: `Invalid student ID format. ${normalizedRule.hint}` };
  }

  return { isValid: false, reason: "Invalid student ID format." };
}

export function studentIdToLoginEmail(studentId: string): string {
  const normalized = normalizeStudentId(studentId);
  if (normalized.includes("@")) {
    return normalized;
  }
  const domain =
    process.env.STUDENT_LOGIN_DOMAIN?.trim().toLowerCase() ||
    DEFAULT_LOGIN_DOMAIN;
  return `${normalized}@${domain}`;
}
