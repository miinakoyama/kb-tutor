import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export interface RosterClass {
  id: string;
  label: string;
}

export interface RosterStudent {
  id: string;
  label: string;
  classId: string | null;
}

export interface TeacherRoster {
  classes: RosterClass[];
  /** Students in the teacher's (or admin's) scope, excluding analytics-excluded profiles. */
  scopedStudents: RosterStudent[];
}

/**
 * Resolve the set of schools and students a teacher (or admin) can see on the
 * dashboard. Mirrors the roster-resolution logic shared by the teacher
 * dashboard and standard-detail endpoints: teachers are scoped to schools
 * they're assigned to (via `school_teachers` or the legacy `schools.teacher_user_id`
 * column), while admins see every school.
 */
export async function resolveTeacherRoster(
  admin: SupabaseAdminClient,
  userId: string,
  role: "teacher" | "admin",
): Promise<TeacherRoster> {
  let schoolIds: string[] = [];
  if (role === "teacher") {
    const [schoolTeachersRes, legacySchoolsRes] = await Promise.all([
      admin
        .from("school_teachers")
        .select("school_id")
        .eq("teacher_user_id", userId),
      admin.from("schools").select("id").eq("teacher_user_id", userId),
    ]);
    if (schoolTeachersRes.error) {
      console.error("[teacher-roster] school_teachers query failed", schoolTeachersRes.error);
    }
    if (legacySchoolsRes.error) {
      console.error("[teacher-roster] legacy schools query failed", legacySchoolsRes.error);
    }
    schoolIds = Array.from(
      new Set([
        ...(schoolTeachersRes.data ?? []).map((row) => row.school_id),
        ...(legacySchoolsRes.data ?? []).map((row) => row.id),
      ]),
    );
  } else {
    const { data: allSchools, error: allSchoolsError } = await admin
      .from("schools")
      .select("id")
      .order("name", { ascending: true });
    if (allSchoolsError) {
      console.error("[teacher-roster] schools query failed", allSchoolsError);
    }
    schoolIds = (allSchools ?? []).map((row) => row.id);
  }

  let schoolRows: { id: string; name: string }[] = [];
  if (schoolIds.length > 0) {
    const { data, error } = await admin
      .from("schools")
      .select("id,name")
      .in("id", schoolIds);
    if (error) {
      console.error("[teacher-roster] school name lookup failed", error);
    }
    schoolRows = data ?? [];
  }

  const classes = schoolRows
    .map((row) => ({ id: String(row.id), label: String(row.name ?? row.id) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  if (schoolIds.length === 0) {
    return { classes, scopedStudents: [] };
  }

  const { data: memberRows, error: memberError } = await admin
    .from("school_members")
    .select("school_id,student_user_id")
    .in("school_id", schoolIds);
  if (memberError) {
    console.error("[teacher-roster] school_members query failed", memberError);
    return { classes, scopedStudents: [] };
  }

  const studentClassMap = new Map<string, string>();
  for (const row of memberRows ?? []) {
    const sid = String(row.student_user_id);
    if (!studentClassMap.has(sid)) {
      studentClassMap.set(sid, String(row.school_id));
    }
  }
  const scopedStudentIds = Array.from(studentClassMap.keys());

  if (scopedStudentIds.length === 0) {
    return { classes, scopedStudents: [] };
  }

  const { data: profileRows, error: profileError } = await admin
    .from("profiles")
    .select("id,display_name,student_id,excluded_from_analytics")
    .in("id", scopedStudentIds);
  if (profileError) {
    console.error("[teacher-roster] profiles query failed", profileError);
  }

  const scopedStudents: RosterStudent[] = [];
  for (const profile of profileRows ?? []) {
    if (profile.excluded_from_analytics === true) continue;
    const id = String(profile.id);
    scopedStudents.push({
      id,
      label: String(profile.display_name || profile.student_id || profile.id),
      classId: studentClassMap.get(id) ?? null,
    });
  }

  return { classes, scopedStudents };
}
