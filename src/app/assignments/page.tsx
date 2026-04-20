import { redirect } from "next/navigation";
import { getStudentAssignmentList } from "@/lib/student-assignments";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StudentAssignmentsList } from "@/components/assignments/StudentAssignmentsList";

export default async function AssignmentsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { assignments, error: listError } = await getStudentAssignmentList(
    supabase,
    user.id,
  );

  return (
    <StudentAssignmentsList
      assignments={assignments}
      loadError={listError}
    />
  );
}
