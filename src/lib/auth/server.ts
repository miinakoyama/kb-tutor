import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole, UserProfile } from "@/lib/auth/types";

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,student_id,display_name,role")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;
  return data as UserProfile;
}

export async function requireRole(allowed: AppRole[]) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    redirect("/login");
  }
  if (!allowed.includes(profile.role)) {
    redirect("/");
  }
  return profile;
}

