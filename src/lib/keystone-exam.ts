import type { SupabaseClient } from "@supabase/supabase-js";

export type KeystoneExamInfo = {
  schoolId: string;
  schoolName: string | null;
  examDate: string;
};

type SchoolMemberRow = {
  school_id: string;
  schools:
    | { id: string; name: string | null; keystone_exam_date: string | null }
    | { id: string; name: string | null; keystone_exam_date: string | null }[]
    | null;
};

function pickSchool(row: SchoolMemberRow):
  | { id: string; name: string | null; keystone_exam_date: string | null }
  | null {
  if (!row.schools) return null;
  if (Array.isArray(row.schools)) return row.schools[0] ?? null;
  return row.schools;
}

/**
 * Returns the nearest upcoming keystone exam date across all the student's
 * enrolled schools, or `null` if no school has one configured (or all
 * configured dates are already in the past).
 *
 * We intentionally prefer a server-side filter on the date so that past
 * exams naturally disappear from the student's home page.
 */
export async function getStudentKeystoneExam(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<KeystoneExamInfo | null> {
  const { data, error } = await supabase
    .from("school_members")
    .select(
      "school_id,schools(id,name,keystone_exam_date)",
    )
    .eq("student_user_id", userId);

  if (error || !data) return null;

  const todayYmd = toYmd(now);

  const candidates: KeystoneExamInfo[] = [];
  for (const row of data as SchoolMemberRow[]) {
    const school = pickSchool(row);
    if (!school?.keystone_exam_date) continue;
    if (school.keystone_exam_date < todayYmd) continue;
    candidates.push({
      schoolId: school.id,
      schoolName: school.name,
      examDate: school.keystone_exam_date,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.examDate.localeCompare(b.examDate));
  return candidates[0];
}

/** Formats a Date as YYYY-MM-DD in the user's local timezone. */
function toYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Computes the number of full days between today (local date) and the given
 * `YYYY-MM-DD` exam date. Returns:
 *   - a positive integer for future dates
 *   - `0` if the exam is today
 *   - a negative integer if the exam is in the past
 *   - `null` if the date string is malformed
 */
export function daysUntilExam(
  examDate: string,
  now: Date = new Date(),
): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return null;
  const [y, m, d] = examDate.split("-").map((part) => Number.parseInt(part, 10));
  if ([y, m, d].some((n) => Number.isNaN(n))) return null;
  const exam = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = exam.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/** Formats an exam date for display, e.g. "May 15, 2026". */
export function formatExamDate(examDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return examDate;
  const [y, m, d] = examDate.split("-").map((part) => Number.parseInt(part, 10));
  const parsed = new Date(y, m - 1, d);
  if (Number.isNaN(parsed.getTime())) return examDate;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
