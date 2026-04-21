import { NextResponse } from "next/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildAssignmentProgress,
  type AssignmentInfo,
  type AssignmentTargetRow,
  type AttemptProgressRow,
} from "@/lib/analytics/assignment-progress";

/**
 * Returns, for every assignment that the teacher has visibility into, a
 * per-student status matrix: Completed / In progress / Not started.
 *
 * Status definitions (per student, for assignments in the same school as the student;
 * the student list is school-based like the student app, not `assignment_targets`-based):
 *   - Completed: `assignment_targets.last_completed_at IS NOT NULL`
 *   - In progress: at least one `attempts` row for this (user, assignment)
 *   - Not started: no completion and no attempts (including when no `assignment_targets` row)
 *
 * Scoping mirrors /api/teacher-dashboard:
 *   - teacher sees only schools they own or are rostered on
 *   - admin sees all schools
 *   - optional ?classId= and ?studentId= narrow the result further. If
 *     `classId` is not in the caller's allowed schools, or `studentId`
 *     is not in the resulting roster, returns { assignments: [], rows: [] }
 *     (200), not a fallback to all schools/students.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const classId = url.searchParams.get("classId") || undefined;
  const studentId = url.searchParams.get("studentId") || undefined;

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, currentProfile?.role);
  if (!role || !["teacher", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const emptyResponse = { assignments: [], rows: [] };

  let schoolIds: string[] = [];
  if (role === "teacher") {
    const [schoolTeachersRes, legacySchoolsRes] = await Promise.all([
      admin
        .from("school_teachers")
        .select("school_id")
        .eq("teacher_user_id", user.id),
      admin.from("schools").select("id").eq("teacher_user_id", user.id),
    ]);
    if (schoolTeachersRes.error) {
      console.error(
        "[teacher-dashboard/assignment-progress] school_teachers query failed",
        schoolTeachersRes.error,
      );
      return NextResponse.json(
        { error: "Failed to resolve teacher schools" },
        { status: 500 },
      );
    }
    if (legacySchoolsRes.error) {
      console.error(
        "[teacher-dashboard/assignment-progress] legacy schools query failed",
        legacySchoolsRes.error,
      );
      return NextResponse.json(
        { error: "Failed to resolve teacher schools" },
        { status: 500 },
      );
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
      .select("id");
    if (allSchoolsError) {
      console.error(
        "[teacher-dashboard/assignment-progress] schools query failed",
        allSchoolsError,
      );
      return NextResponse.json(
        { error: "Failed to load schools" },
        { status: 500 },
      );
    }
    schoolIds = (allSchools ?? []).map((row) => row.id);
  }

  if (schoolIds.length === 0) {
    return NextResponse.json(emptyResponse);
  }

  // Invalid filter: do not fall back to all schools (or all students).
  if (classId && !schoolIds.includes(classId)) {
    return NextResponse.json(emptyResponse);
  }

  const effectiveSchoolIds = classId ? [classId] : schoolIds;

  const { data: memberRows, error: memberError } = await admin
    .from("school_members")
    .select("school_id,student_user_id")
    .in("school_id", effectiveSchoolIds);
  if (memberError) {
    console.error(
      "[teacher-dashboard/assignment-progress] school_members query failed",
      memberError,
    );
    return NextResponse.json(
      { error: "Failed to load class roster" },
      { status: 500 },
    );
  }

  const studentClassMap = new Map<string, string>();
  for (const row of memberRows ?? []) {
    const sid = String(row.student_user_id);
    if (!studentClassMap.has(sid)) {
      studentClassMap.set(sid, String(row.school_id));
    }
  }

  if (studentId && !studentClassMap.has(studentId)) {
    return NextResponse.json(emptyResponse);
  }

  const scopedStudentIds = studentId
    ? [studentId]
    : Array.from(studentClassMap.keys());

  if (scopedStudentIds.length === 0) {
    return NextResponse.json(emptyResponse);
  }

  const { data: profileRows, error: profileError } = await admin
    .from("profiles")
    .select("id,display_name,student_id")
    .in("id", scopedStudentIds);
  if (profileError) {
    console.error(
      "[teacher-dashboard/assignment-progress] profiles query failed",
      profileError,
    );
    return NextResponse.json(
      { error: "Failed to load student profiles" },
      { status: 500 },
    );
  }

  const studentLabelMap = new Map<string, string>();
  const studentIdCodeMap = new Map<string, string | null>();
  for (const profile of profileRows ?? []) {
    const id = String(profile.id);
    studentLabelMap.set(
      id,
      String(profile.display_name || profile.student_id || profile.id),
    );
    const code = profile.student_id;
    studentIdCodeMap.set(
      id,
      typeof code === "string" && code.trim().length > 0 ? code.trim() : null,
    );
  }

  const { data: assignmentRows, error: assignmentError } = await admin
    .from("assignments")
    .select("id,title,school_id,due_date,mode,max_questions")
    .in("school_id", effectiveSchoolIds)
    .order("created_at", { ascending: false });
  if (assignmentError) {
    console.error(
      "[teacher-dashboard/assignment-progress] assignments query failed",
      assignmentError,
    );
    return NextResponse.json(
      { error: "Failed to load assignments" },
      { status: 500 },
    );
  }

  const assignmentIds = (assignmentRows ?? []).map((row) => String(row.id));
  if (assignmentIds.length === 0) {
    return NextResponse.json({
      assignments: [],
      rows: scopedStudentIds.map((id) => ({
        studentId: id,
        label: studentLabelMap.get(id) ?? id,
        studentIdCode: studentIdCodeMap.get(id) ?? null,
        classId: studentClassMap.get(id) ?? null,
        progress: {},
        completedCount: 0,
        inProgressCount: 0,
        notStartedCount: 0,
      })),
    });
  }

  const [
    { data: targetRows, error: targetError },
    { data: attemptRows, error: attemptError },
    { data: snapshotRows, error: snapshotError },
  ] = await Promise.all([
    admin
      .from("assignment_targets")
      .select("assignment_id,student_user_id,last_completed_at")
      .in("assignment_id", assignmentIds)
      .in("student_user_id", scopedStudentIds),
    admin
      .from("attempts")
      .select("user_id,assignment_id,question_id")
      .in("assignment_id", assignmentIds)
      .in("user_id", scopedStudentIds),
    admin
      .from("assignment_question_snapshots")
      .select("assignment_id")
      .in("assignment_id", assignmentIds),
  ]);

  if (targetError) {
    console.error(
      "[teacher-dashboard/assignment-progress] assignment_targets query failed",
      targetError,
    );
    return NextResponse.json(
      { error: "Failed to load assignment targets" },
      { status: 500 },
    );
  }
  if (attemptError) {
    console.error(
      "[teacher-dashboard/assignment-progress] attempts query failed",
      attemptError,
    );
    return NextResponse.json(
      { error: "Failed to load attempts" },
      { status: 500 },
    );
  }
  if (snapshotError) {
    console.error(
      "[teacher-dashboard/assignment-progress] snapshots query failed",
      snapshotError,
    );
    return NextResponse.json(
      { error: "Failed to load question snapshots" },
      { status: 500 },
    );
  }

  const snapshotCount = new Map<string, number>();
  for (const row of snapshotRows ?? []) {
    const id = String(row.assignment_id);
    snapshotCount.set(id, (snapshotCount.get(id) ?? 0) + 1);
  }

  const assignments: AssignmentInfo[] = (assignmentRows ?? []).map((row) => {
    const mode = (row.mode as AssignmentInfo["mode"]) ?? null;
    const id = String(row.id);
    return {
      id,
      title: String(row.title),
      schoolId: String(row.school_id),
      dueDate: row.due_date ? String(row.due_date) : null,
      mode,
      totalQuestions:
        mode === "review"
          ? (typeof row.max_questions === "number" ? row.max_questions : null)
          : (snapshotCount.get(id) ?? null),
    };
  });

  const targets: AssignmentTargetRow[] = (targetRows ?? []).map((row) => ({
    assignmentId: String(row.assignment_id),
    studentUserId: String(row.student_user_id),
    lastCompletedAt: row.last_completed_at ? String(row.last_completed_at) : null,
  }));

  const attempts: AttemptProgressRow[] = (attemptRows ?? []).map((row) => ({
    userId: String(row.user_id),
    assignmentId: String(row.assignment_id),
    questionId: String(row.question_id),
  }));

  const payload = buildAssignmentProgress({
    assignments,
    targets,
    attempts,
    students: scopedStudentIds.map((id) => ({
      id,
      label: studentLabelMap.get(id) ?? id,
      classId: studentClassMap.get(id) ?? null,
      studentIdCode: studentIdCodeMap.get(id) ?? null,
    })),
  });

  return NextResponse.json(payload);
}
