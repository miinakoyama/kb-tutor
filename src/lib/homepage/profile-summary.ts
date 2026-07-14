import type { SupabaseClient } from "@supabase/supabase-js";

export type StudentProfileSummary = {
  name: string | null;
  schoolName: string | null;
};

type SchoolRel = { name: string | null } | { name: string | null }[] | null;

function pickSchoolName(rel: SchoolRel): string | null {
  if (!rel) return null;
  const school = Array.isArray(rel) ? rel[0] : rel;
  return school?.name ?? null;
}

/**
 * Name (profiles.display_name) and enrolled school name for the profile card.
 * Both are nullable — the caller omits whatever isn't set rather than
 * inventing a value. Uses the auth-scoped client (RLS lets a student read
 * their own profile and school membership), same pattern as
 * getStudentKeystoneExam.
 */
export async function getStudentProfileSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<StudentProfileSummary> {
  const [{ data: profile }, { data: memberRows }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    supabase
      .from("school_members")
      .select("schools(name)")
      .eq("student_user_id", userId)
      .limit(1),
  ]);

  const rawName =
    profile && typeof profile.display_name === "string"
      ? profile.display_name.trim()
      : "";

  const schoolRow = memberRows?.[0] as { schools?: SchoolRel } | undefined;

  return {
    name: rawName.length > 0 ? rawName : null,
    schoolName: pickSchoolName(schoolRow?.schools ?? null),
  };
}
