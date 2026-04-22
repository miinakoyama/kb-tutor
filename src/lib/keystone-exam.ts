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

export interface GetStudentKeystoneExamOptions {
  /** Reference "now". Defaults to `new Date()`; useful for tests. */
  now?: Date;
  /**
   * IANA time zone used to compute "today" for the past-date cutoff. When
   * omitted, falls back to the server process's local time zone, which on
   * UTC deployments can shift the cutoff by up to a day relative to the
   * student's wall clock. Callers should forward the same time zone they
   * render the rest of the page in.
   */
  timeZone?: string;
  previewSchoolId?: string | null;
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
  options: GetStudentKeystoneExamOptions = {},
): Promise<KeystoneExamInfo | null> {
  const { previewSchoolId } = options;
  let data: SchoolMemberRow[] | null = null;
  if (previewSchoolId) {
    const { data: schoolRow, error } = await supabase
      .from("schools")
      .select("id,name,keystone_exam_date")
      .eq("id", previewSchoolId)
      .maybeSingle();
    if (error || !schoolRow) return null;
    data = [
      {
        school_id: schoolRow.id,
        schools: {
          id: schoolRow.id,
          name: schoolRow.name,
          keystone_exam_date: schoolRow.keystone_exam_date,
        },
      },
    ];
  } else {
    const query = await supabase
      .from("school_members")
      .select("school_id,schools(id,name,keystone_exam_date)")
      .eq("student_user_id", userId);
    if (query.error || !query.data) return null;
    data = query.data as SchoolMemberRow[];
  }

  const now = options.now ?? new Date();
  const todayYmd = todayYmdInTimeZone(options.timeZone, now);

  const candidates: KeystoneExamInfo[] = [];
  for (const row of data) {
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

/**
 * Formats `now` as YYYY-MM-DD in `timeZone`. Falls back to the server's
 * local date when `timeZone` is missing or invalid. Uses `en-CA` because
 * that locale conveniently renders dates as `YYYY-MM-DD`.
 */
function todayYmdInTimeZone(timeZone: string | undefined, now: Date): string {
  const localYmd = () => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  if (!timeZone) return localYmd();
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (!y || !m || !d) return localYmd();
    return `${y}-${m}-${d}`;
  } catch {
    return localYmd();
  }
}

/**
 * Parses a `YYYY-MM-DD` string into its numeric parts, rejecting inputs that
 * fail a round-trip through `Date`. This catches calendar-impossible inputs
 * like `"2026-02-31"` or `"2026-13-01"` that `new Date(y, m - 1, d)` would
 * silently overflow (e.g. into March 3rd or January 2027).
 */
function parseYmd(
  examDate: string,
): { y: number; m: number; d: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return null;
  const [y, m, d] = examDate.split("-").map((part) => Number.parseInt(part, 10));
  if ([y, m, d].some((n) => Number.isNaN(n))) return null;
  const parsed = new Date(y, m - 1, d);
  if (
    parsed.getFullYear() !== y ||
    parsed.getMonth() !== m - 1 ||
    parsed.getDate() !== d
  ) {
    return null;
  }
  return { y, m, d };
}

/**
 * Computes the number of full days between today (local date) and the given
 * `YYYY-MM-DD` exam date. Returns:
 *   - a positive integer for future dates
 *   - `0` if the exam is today
 *   - a negative integer if the exam is in the past
 *   - `null` if the date string is malformed or calendar-impossible
 *     (e.g. `"2026-02-31"`)
 */
export function daysUntilExam(
  examDate: string,
  now: Date = new Date(),
): number | null {
  const parts = parseYmd(examDate);
  if (!parts) return null;
  const exam = new Date(parts.y, parts.m - 1, parts.d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = exam.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Formats an exam date for display, e.g. "May 15, 2026". Returns the input
 * string as-is when it is malformed or calendar-impossible.
 */
export function formatExamDate(examDate: string): string {
  const parts = parseYmd(examDate);
  if (!parts) return examDate;
  const parsed = new Date(parts.y, parts.m - 1, parts.d);
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
