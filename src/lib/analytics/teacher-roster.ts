import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export interface RosterClass {
  id: string;
  label: string;
}

export interface RosterStudent {
  id: string;
  label: string;
  /** First school id for legacy UI fields; use `classIds` for membership checks. */
  classId: string | null;
  classIds: string[];
}

export interface TeacherRoster {
  classes: RosterClass[];
  /** Students in the teacher's (or admin's) scope, excluding analytics-excluded profiles. */
  scopedStudents: RosterStudent[];
}

export class TeacherRosterLookupError extends Error {
  constructor(message = "Failed to load teacher roster.") {
    super(message);
    this.name = "TeacherRosterLookupError";
  }
}

function failRosterLookup(context: string, error: unknown): never {
  console.error(`[teacher-roster] ${context} failed`, error);
  throw new TeacherRosterLookupError();
}

/**
 * Resolve the set of schools and students a teacher (or admin) can see on the
 * dashboard. Mirrors the roster-resolution logic shared by the teacher
 * dashboard and standard-detail endpoints: teachers are scoped to schools
 * they're assigned to through `school_teachers`, while admins see every
 * school. A teacher account may have at most one school membership.
 */
export async function resolveTeacherRoster(
  admin: SupabaseAdminClient,
  userId: string,
  role: "teacher" | "admin",
): Promise<TeacherRoster> {
  let schoolIds: string[] = [];
  if (role === "teacher") {
    const schoolTeachersRes = await admin
      .from("school_teachers")
      .select("school_id")
      .eq("teacher_user_id", userId);
    if (schoolTeachersRes.error) {
      failRosterLookup("school_teachers query", schoolTeachersRes.error);
    }
    schoolIds = Array.from(
      new Set((schoolTeachersRes.data ?? []).map((row) => row.school_id)),
    );
    if (schoolIds.length > 1) {
      failRosterLookup(
        "teacher school invariant",
        new Error("Teacher account is assigned to multiple schools."),
      );
    }
  } else {
    const { data: allSchools, error: allSchoolsError } = await admin
      .from("schools")
      .select("id")
      .order("name", { ascending: true });
    if (allSchoolsError) {
      failRosterLookup("schools query", allSchoolsError);
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
      failRosterLookup("school name lookup", error);
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
    failRosterLookup("school_members query", memberError);
  }

  const studentClassMap = new Map<string, string[]>();
  for (const row of memberRows ?? []) {
    const sid = String(row.student_user_id);
    const schoolId = String(row.school_id);
    const classIds = studentClassMap.get(sid);
    if (classIds) {
      if (!classIds.includes(schoolId)) {
        classIds.push(schoolId);
      }
    } else {
      studentClassMap.set(sid, [schoolId]);
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
    failRosterLookup("profiles query", profileError);
  }

  const scopedStudents: RosterStudent[] = [];
  for (const profile of profileRows ?? []) {
    if (profile.excluded_from_analytics === true) continue;
    const id = String(profile.id);
    scopedStudents.push({
      id,
      label: String(profile.display_name || profile.student_id || profile.id),
      classId: studentClassMap.get(id)?.[0] ?? null,
      classIds: studentClassMap.get(id) ?? [],
    });
  }

  return { classes, scopedStudents };
}
