const DEFAULT_LOGIN_DOMAIN = "student.local";

export function normalizeStudentId(input: string): string {
  return input.trim().toLowerCase();
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

