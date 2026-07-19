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
  schoolId?: string | null;
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
  const schoolId =
    typeof payload.schoolId === "string" && payload.schoolId.trim()
      ? payload.schoolId.trim()
      : null;

  if (!email || !password || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!["teacher", "admin"].includes(role)) {
    return NextResponse.json({ error: "Only teacher and admin roles can be provisioned here." }, { status: 400 });
  }
  if (
    payload.schoolId !== undefined &&
    payload.schoolId !== null &&
    typeof payload.schoolId !== "string"
  ) {
    return NextResponse.json(
      { error: "schoolId must be a string or null" },
      { status: 400 },
    );
  }
  if (role !== "teacher" && schoolId) {
    return NextResponse.json(
      { error: "Only teacher accounts can be assigned to a school" },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();

  if (schoolId) {
    const { data: school, error: schoolError } = await admin
      .from("schools")
      .select("id")
      .eq("id", schoolId)
      .maybeSingle();
    if (schoolError) {
      return NextResponse.json({ error: schoolError.message }, { status: 400 });
    }
    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 400 });
    }
  }

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

  if (role === "teacher" && schoolId) {
    const { error: schoolAssignmentError } = await admin.rpc(
      "set_teacher_school_assignment",
      {
        p_teacher_user_id: createdUser.user.id,
        p_school_id: schoolId,
      },
    );
    if (schoolAssignmentError) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(
        createdUser.user.id,
      );
      const cleanupMessage = cleanupError
        ? ` Cleanup also failed: ${cleanupError.message}`
        : "";
      return NextResponse.json(
        {
          error: `Failed to assign the teacher to the school: ${schoolAssignmentError.message}.${cleanupMessage}`,
        },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    userId: createdUser.user.id,
    email,
    schoolId,
  });
}
