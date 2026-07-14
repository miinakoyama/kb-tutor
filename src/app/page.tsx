import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HomePageContent } from "@/components/HomePageContent";
import { getStudentAssignmentList } from "@/lib/student-assignments";
import { getStudentKeystoneExam } from "@/lib/keystone-exam";
import { getStudentUserSettings } from "@/lib/user-settings";
import { getRoleLandingPath } from "@/lib/auth/role";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { getSelfPracticeWeeklySeconds } from "@/lib/homepage/self-practice-stats";
import { getTopicKcCoverage } from "@/lib/homepage/kc-coverage";
import { getStudentProfileSummary } from "@/lib/homepage/profile-summary";

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
  const landingPath = getRoleLandingPath(role);
  if (landingPath !== "/") {
    redirect(landingPath);
  }

  const { timeZone } = await getStudentUserSettings(supabase);

  const [
    assignmentResult,
    keystoneExam,
    selfPracticeWeeklySeconds,
    topicKcCoverage,
    profileSummary,
  ] = await Promise.all([
    getStudentAssignmentList(supabase, user.id),
    getStudentKeystoneExam(supabase, user.id, { timeZone }),
    getSelfPracticeWeeklySeconds(supabase, user.id),
    getTopicKcCoverage(supabase, user.id),
    getStudentProfileSummary(supabase, user.id),
  ]);

  return (
    <HomePageContent
      assignments={assignmentResult.assignments}
      keystoneExam={keystoneExam}
      selfPracticeWeeklySeconds={selfPracticeWeeklySeconds}
      topicKcCoverage={topicKcCoverage}
      profileSummary={profileSummary}
    />
  );
}
