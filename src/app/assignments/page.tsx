import { redirect } from "next/navigation";
import { getStudentAssignmentList } from "@/lib/student-assignments";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StudentAssignmentsList } from "@/components/assignments/StudentAssignmentsList";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { getStudentViewContext } from "@/lib/student-view";

export default async function AssignmentsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, profile?.role);
  const studentView = await getStudentViewContext();
  const previewSchoolId =
    (role === "teacher" || role === "admin") && studentView.isActive
      ? studentView.schoolId
      : null;

  const { assignments, error: listError } = await getStudentAssignmentList(
    supabase,
    user.id,
    { previewSchoolId },
  );

  return (
    <StudentAssignmentsList
      assignments={assignments}
      loadError={listError}
    />
  );
}
