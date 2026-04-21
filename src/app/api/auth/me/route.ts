import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveMetadataRole, resolveProfileRole } from "@/lib/auth/role";

type AppRole = "student" | "teacher" | "admin";

interface SchoolRef {
  id: string;
  name: string;
}

function inferRoleFromUser(user: User): AppRole {
  return resolveMetadataRole(user) ?? "student";
}

async function loadSchoolsForUser(
  client: SupabaseClient,
  userId: string,
  role: AppRole,
): Promise<SchoolRef[]> {
  if (role === "admin") return [];

  const table = role === "teacher" ? "school_teachers" : "school_members";
  const userCol = role === "teacher" ? "teacher_user_id" : "student_user_id";

  const { data: links } = await client
    .from(table)
    .select(`school_id`)
    .eq(userCol, userId);

  const schoolIds = Array.from(
    new Set((links ?? []).map((row) => row.school_id as string)),
  );
  if (schoolIds.length === 0) return [];

  const { data: schools } = await client
    .from("schools")
    .select("id,name")
    .in("id", schoolIds);

  return (schools ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
  }));
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null, profile: null, schools: [] }, { status: 200 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,student_id,display_name,role")
    .eq("id", user.id)
    .maybeSingle();

  const sessionProfileRole = resolveProfileRole(profile?.role);
  if (profile && sessionProfileRole) {
    const schools = await loadSchoolsForUser(
      createSupabaseAdminClient(),
      user.id,
      sessionProfileRole,
    );
    return NextResponse.json({ user, profile, schools }, { status: 200 });
  }

  // If session profile is missing/invalid, re-check via service-role before metadata fallback.
  if (!sessionProfileRole || profileError) {
    const admin = createSupabaseAdminClient();
    const { data: adminProfile } = await admin
      .from("profiles")
      .select("id,email,student_id,display_name,role")
      .eq("id", user.id)
      .maybeSingle();

    const adminProfileRole = resolveProfileRole(adminProfile?.role);
    if (adminProfile && adminProfileRole) {
      const schools = await loadSchoolsForUser(admin, user.id, adminProfileRole);
      return NextResponse.json(
        { user, profile: adminProfile, schools },
        { status: 200 },
      );
    }
  }

  const fallbackProfile = {
    id: user.id,
    email: user.email ?? `${user.id}@[REDACTED]`,
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
    const schools = await loadSchoolsForUser(
      admin,
      user.id,
      fallbackProfile.role,
    );
    return NextResponse.json(
      { user, profile: fallbackProfile, schools },
      { status: 200 },
    );
  }

  const { data: ensuredProfile } = await admin
    .from("profiles")
    .select("id,email,student_id,display_name,role")
    .eq("id", user.id)
    .maybeSingle();

  const finalProfile = ensuredProfile ?? fallbackProfile;
  const finalRole =
    resolveProfileRole(finalProfile.role) ?? fallbackProfile.role;
  const schools = await loadSchoolsForUser(admin, user.id, finalRole);

  return NextResponse.json(
    { user, profile: finalProfile, schools },
    { status: 200 },
  );
}
