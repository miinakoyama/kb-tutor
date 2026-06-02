import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HomePageContent } from "@/components/HomePageContent";
import { getStudentAssignmentList } from "@/lib/student-assignments";
import { getStudentKeystoneExam } from "@/lib/keystone-exam";
import { getStudentUserSettings } from "@/lib/user-settings";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { timeZone } = await getStudentUserSettings(supabase);

  const [assignmentResult, keystoneExam] = await Promise.all([
    getStudentAssignmentList(supabase, user.id),
    getStudentKeystoneExam(supabase, user.id, { timeZone }),
  ]);

  return (
    <HomePageContent
      assignments={assignmentResult.assignments}
      keystoneExam={keystoneExam}
    />
  );
}
