import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRole } from "@/lib/auth/role";

async function getRequester() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  let role = resolveRole(profile?.role, user);
  if (!role) {
    const admin = createSupabaseAdminClient();
    const { data: adminProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    role = resolveRole(adminProfile?.role, user);
  }

  return { id: user.id, role };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assignmentId } = await context.params;
  const normalizedAssignmentId = assignmentId?.trim();
  if (!normalizedAssignmentId) {
    return NextResponse.json({ error: "Missing assignment id" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("id,school_id")
    .eq("id", normalizedAssignmentId)
    .maybeSingle();
  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 400 });
  }
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  const { data: targetRow, error: targetError } = await admin
    .from("assignment_targets")
    .select("assignment_id")
    .eq("assignment_id", normalizedAssignmentId)
    .eq("student_user_id", requester.id)
    .maybeSingle();
  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 400 });
  }

  let canAccess = Boolean(targetRow);
  if (!canAccess && ["teacher", "admin"].includes(requester.role ?? "")) {
    if (requester.role === "admin") {
      canAccess = true;
    } else {
      const [{ data: teacherSchool }, { data: schoolTeacherRow }] = await Promise.all([
        admin
          .from("schools")
          .select("id")
          .eq("id", assignment.school_id)
          .eq("teacher_user_id", requester.id)
          .maybeSingle(),
        admin
          .from("school_teachers")
          .select("school_id")
          .eq("school_id", assignment.school_id)
          .eq("teacher_user_id", requester.id)
          .maybeSingle(),
      ]);
      canAccess = Boolean(teacherSchool || schoolTeacherRow);
    }
  }

  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: snapshotRows, error: snapshotError } = await admin
    .from("assignment_question_snapshots")
    .select("payload,order_index")
    .eq("assignment_id", normalizedAssignmentId)
    .order("order_index", { ascending: true });
  if (snapshotError) {
    return NextResponse.json({ error: snapshotError.message }, { status: 400 });
  }

  return NextResponse.json({
    questions: (snapshotRows ?? []).map((row) => row.payload),
  });
}
