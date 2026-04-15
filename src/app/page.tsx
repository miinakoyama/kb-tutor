import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HomePageContent } from "@/components/HomePageContent";
import { getStudentNotifications } from "@/lib/notifications";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: assignedRows } = await supabase
    .from("assignment_targets")
    .select("assignment_id")
    .eq("student_user_id", user.id);

  const notifications = await getStudentNotifications(supabase, user.id);

  return (
    <HomePageContent
      assignmentCount={assignedRows?.length ?? 0}
      notifications={notifications}
    />
  );
}
