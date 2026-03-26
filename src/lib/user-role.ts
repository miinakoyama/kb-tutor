"use client";

export type UserRole = "student" | "teacher";

const USER_ROLE_KEY = "kb-tutor-user-role";

export function getStoredUserRole(defaultRole: UserRole = "student"): UserRole {
  if (typeof window === "undefined") return defaultRole;
  const raw = window.localStorage.getItem(USER_ROLE_KEY);
  if (raw === "teacher" || raw === "student") return raw;
  return defaultRole;
}

export function setStoredUserRole(role: UserRole): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_ROLE_KEY, role);
}

export function isTeacherRole(role: UserRole): boolean {
  return role === "teacher";
}

export const USER_ROLE_STORAGE_KEY = USER_ROLE_KEY;
