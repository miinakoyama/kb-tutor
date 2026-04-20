import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HomePageContent } from "@/components/HomePageContent";
import { getStudentNotifications } from "@/lib/notifications";
import { getStudentAssignmentList } from "@/lib/student-assignments";
import { getStudentKeystoneExam } from "@/lib/keystone-exam";
import { DEFAULT_APP_TIME_ZONE, normalizeTimeZone } from "@/lib/timezone";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { timeZone, notificationsLastReadAt } =
    await getStudentUserSettings(supabase);

  const [notificationResult, assignmentResult] = await Promise.all([
    getStudentNotifications(supabase, user.id, {
      timeZone,
      lastReadAt: notificationsLastReadAt,
    }),
    getStudentAssignmentList(supabase, user.id),
    getStudentKeystoneExam(supabase, user.id),
  ]);

  return (
    <HomePageContent
      assignments={assignmentResult.assignments}
      notifications={notificationResult.notifications}
      keystoneExam={keystoneExam}
    />
  );
}
