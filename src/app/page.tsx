import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HomePageContent } from "@/components/HomePageContent";
import { getStudentNotifications } from "@/lib/notifications";
import { getStudentAssignmentList } from "@/lib/student-assignments";
import { getStudentKeystoneExam } from "@/lib/keystone-exam";
import { getStudentUserSettings } from "@/lib/user-settings";
import { getStudentViewContext } from "@/lib/student-view";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";

export default async function Home() {
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

  const { timeZone, notificationsLastReadAt } =
    await getStudentUserSettings(supabase);

  const [notificationResult, assignmentResult, keystoneExam] =
    await Promise.all([
      getStudentNotifications(supabase, user.id, {
        timeZone,
        lastReadAt: notificationsLastReadAt,
        previewSchoolId,
      }),
      getStudentAssignmentList(supabase, user.id, { previewSchoolId }),
      getStudentKeystoneExam(supabase, user.id, { timeZone, previewSchoolId }),
    ]);

  return (
    <HomePageContent
      assignments={assignmentResult.assignments}
      notifications={notificationResult.notifications}
      keystoneExam={keystoneExam}
    />
  );
}
