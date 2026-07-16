import { redirect } from "next/navigation";
import { getStudentAssignmentList } from "@/lib/student-assignments";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StudentAssignmentsPageClient } from "@/components/assignments/StudentAssignmentsPageClient";

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
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
  const { q } = await searchParams;

  return (
    <StudentAssignmentsPageClient
      assignments={assignments}
      loadError={listError}
      initialQuery={typeof q === "string" ? q : ""}
    />
  );
}
