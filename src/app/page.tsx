import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HomePageContent } from "@/components/HomePageContent";
import { getStudentNotifications } from "@/lib/notifications";
import { DEFAULT_APP_TIME_ZONE, normalizeTimeZone } from "@/lib/timezone";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: settingsData } = await supabase
    .from("user_settings")
    .select("time_zone")
    .maybeSingle();
  const timeZone = normalizeTimeZone(
    settingsData?.time_zone,
    DEFAULT_APP_TIME_ZONE,
  );

  const notificationResult = await getStudentNotifications(supabase, user.id, {
    timeZone,
  });

  return (
    <HomePageContent
      assignmentCount={notificationResult.assignmentTargetCount}
      notifications={notificationResult.notifications}
    />
  );
}
