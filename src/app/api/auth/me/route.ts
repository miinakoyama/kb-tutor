import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveMetadataRole, resolveProfileRole } from "@/lib/auth/role";

type AppRole = "student" | "teacher" | "admin";

function inferRoleFromUser(user: User): AppRole {
  return resolveMetadataRole(user) ?? "student";
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null, profile: null }, { status: 200 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,student_id,display_name,role")
    .eq("id", user.id)
    .maybeSingle();

  const sessionProfileRole = resolveProfileRole(profile?.role);
  if (profile && sessionProfileRole) {
    return NextResponse.json({ user, profile }, { status: 200 });
  }

  // If session profile is missing/invalid, re-check via service-role before metadata fallback.
  if (!sessionProfileRole || profileError) {
    const admin = createSupabaseAdminClient();
    const { data: adminProfile } = await admin
      .from("profiles")
      .select("id,email,student_id,display_name,role")
      .eq("id", user.id)
      .maybeSingle();

    if (adminProfile && resolveProfileRole(adminProfile.role)) {
      return NextResponse.json({ user, profile: adminProfile }, { status: 200 });
    }
  }

  const fallbackProfile = {
    id: user.id,
    email: user.email ?? `${user.id}@student.local`,
    student_id:
      typeof user.user_metadata?.student_id === "string"
        ? user.user_metadata.student_id
        : null,
    display_name:
      typeof user.user_metadata?.display_name === "string"
        ? user.user_metadata.display_name
        : null,
    role: inferRoleFromUser(user),
  };

  // Self-heal missing profile rows (common for manually created auth users).
  const admin = createSupabaseAdminClient();
  const { error: upsertError } = await admin
    .from("profiles")
    .upsert(fallbackProfile, { onConflict: "id" });

  if (upsertError) {
    return NextResponse.json({ user, profile: fallbackProfile }, { status: 200 });
  }

  const { data: ensuredProfile } = await admin
    .from("profiles")
    .select("id,email,student_id,display_name,role")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json(
    { user, profile: ensuredProfile ?? fallbackProfile },
    { status: 200 },
  );
}
