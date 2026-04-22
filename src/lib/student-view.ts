import { cookies } from "next/headers";
import type { AppRole } from "@/lib/auth/types";

export const STUDENT_VIEW_SCHOOL_ID_COOKIE = "kb_student_view_school_id";
export const STUDENT_VIEW_SCHOOL_NAME_COOKIE = "kb_student_view_school_name";

export interface StudentViewContext {
  isActive: boolean;
  schoolId: string | null;
  schoolName: string | null;
}

export function canUseStudentView(role: AppRole | null): boolean {
  return role === "teacher" || role === "admin";
}

export async function getStudentViewContext(): Promise<StudentViewContext> {
  const store = await cookies();
  const schoolId = store.get(STUDENT_VIEW_SCHOOL_ID_COOKIE)?.value ?? null;
  const schoolNameRaw = store.get(STUDENT_VIEW_SCHOOL_NAME_COOKIE)?.value ?? null;
  const schoolName = schoolNameRaw ? decodeURIComponent(schoolNameRaw) : null;
  return {
    isActive: Boolean(schoolId),
    schoolId,
    schoolName,
  };
}
