import { NextResponse } from "next/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { countIncompleteEnrolledAssignmentsForStudent } from "@/lib/assignment-school-completion";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ is_student: false }, { status: 200 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, profile?.role);

  if (role !== "student") {
    return NextResponse.json(
      { is_student: false, student_user_id: user.id },
      { status: 200 },
    );
  }

  const admin = createSupabaseAdminClient();
  const { total, incomplete, error } =
    await countIncompleteEnrolledAssignmentsForStudent(admin, user.id);

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json(
    {
      is_student: true,
      student_user_id: user.id,
      total_assignments: total,
      incomplete_assignments: incomplete,
      all_assignments_completed: total > 0 && incomplete === 0,
    },
    { status: 200 },
  );
}
