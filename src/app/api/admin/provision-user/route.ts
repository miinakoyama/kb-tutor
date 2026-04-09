import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { studentIdToLoginEmail, normalizeStudentId } from "@/lib/auth/student-id";
import type { AppRole } from "@/lib/auth/types";
import { resolveRole } from "@/lib/auth/role";

interface ProvisionPayload {
  studentId: string;
  password: string;
  displayName?: string;
  role: AppRole;
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
  let requesterRole = resolveRole(requesterProfile?.role, user);
  if (requesterRole !== "admin") {
    const admin = createSupabaseAdminClient();
    const { data: adminProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    requesterRole = resolveRole(adminProfile?.role, user);
  }
  if (requesterRole !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json()) as ProvisionPayload;
  const studentId = normalizeStudentId(payload.studentId || "");
  const password = payload.password?.trim() || "";
  const role = payload.role;
  const displayName = payload.displayName?.trim() || null;

  if (!studentId || !password || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!["student", "teacher", "admin"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const email = studentIdToLoginEmail(studentId);

  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      student_id: studentId,
      role,
    },
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
      student_id: studentId,
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

