export type AppRole = "student" | "teacher" | "admin";

export interface UserProfile {
  id: string;
  email: string;
  student_id: string | null;
  display_name: string | null;
  role: AppRole;
}

