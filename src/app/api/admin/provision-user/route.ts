import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/types";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";

interface StaffProvisionPayload {
  email: string;
  password: string;
  displayName?: string;
  role: "teacher" | "admin";
}

export async function POST(request: Request) {
  const requester = await createSupabaseServerClient();
  const {
    data: { user },
  } = await requester.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: requesterProfile } = await requester
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const requesterRole = await resolveRoleWithServerFallback(user, requesterProfile?.role);
  if (requesterRole !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json()) as StaffProvisionPayload;
  const email = payload.email?.trim().toLowerCase();
  const password = payload.password?.trim();
  const role = payload.role as AppRole;
  const displayName = payload.displayName?.trim() || null;

  if (!email || !password || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!["teacher", "admin"].includes(role)) {
    return NextResponse.json({ error: "Only teacher and admin roles can be provisioned here." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role },
  });

  if (createError || !createdUser.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Failed to create user" },
      { status: 400 },
    );
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: createdUser.user.id,
      email,
      display_name: displayName,
      role,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    userId: createdUser.user.id,
    email,
  });
}
