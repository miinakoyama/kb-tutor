import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HomePageContent } from "@/components/HomePageContent";
import { getStudentNotifications } from "@/lib/notifications";
import { getStudentAssignmentList } from "@/lib/student-assignments";
import { DEFAULT_APP_TIME_ZONE, normalizeTimeZone } from "@/lib/timezone";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch each column independently so a missing column in one legacy
  // environment (e.g. `time_zone` before migration or
  // `notifications_last_read_at` before migration) doesn't poison the other.
  const [{ data: timeZoneRow }, { data: notifReadRow }] = await Promise.all([
    supabase.from("user_settings").select("time_zone").maybeSingle(),
    supabase
      .from("user_settings")
      .select("notifications_last_read_at")
      .maybeSingle(),
  ]);
  const timeZone = normalizeTimeZone(
    timeZoneRow?.time_zone,
    DEFAULT_APP_TIME_ZONE,
  );
  const notificationsLastReadAt =
    notifReadRow?.notifications_last_read_at ?? null;

  const [notificationResult, assignmentResult] = await Promise.all([
    getStudentNotifications(supabase, user.id, {
      timeZone,
      lastReadAt: notificationsLastReadAt,
    }),
    getStudentAssignmentList(supabase, user.id),
  ]);

  return (
    <HomePageContent
      assignments={assignmentResult.assignments}
      notifications={notificationResult.notifications}
    />
  );
}
