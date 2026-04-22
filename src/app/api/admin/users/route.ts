import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/types";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";

async function requireAdmin() {
  const requester = await createSupabaseServerClient();
  const {
    data: { user },
  } = await requester.auth.getUser();
  if (!user) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await requester
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, profile?.role);
  if (role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, userId: user.id };
}

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const roleFilter = url.searchParams.get("role");

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("profiles")
    .select("id,email,student_id,display_name,role,excluded_from_analytics,created_at")
    .order("created_at", { ascending: false });

  if (roleFilter && ["student", "teacher", "admin"].includes(roleFilter)) {
    query = query.eq("role", roleFilter as AppRole);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ users: data ?? [] });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json()) as {
    id?: string;
    role?: AppRole;
    displayName?: string | null;
    studentId?: string | null;
    excludedFromAnalytics?: boolean;
  };

  if (!body.id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }
  if (body.role && !["student", "teacher", "admin"].includes(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const updatePayload: {
    role?: AppRole;
    display_name?: string | null;
    student_id?: string | null;
    excluded_from_analytics?: boolean;
  } = {};
  if (body.role) updatePayload.role = body.role;
  if (body.displayName !== undefined) updatePayload.display_name = body.displayName;
  if (body.studentId !== undefined) updatePayload.student_id = body.studentId;
  if (typeof body.excludedFromAnalytics === "boolean") {
    updatePayload.excluded_from_analytics = body.excludedFromAnalytics;
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await admin.from("profiles").update(updatePayload).eq("id", body.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (body.role) {
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(body.id);
    if (authUserError || !authUser.user) {
      return NextResponse.json(
        {
          error:
            authUserError?.message ??
            "Profile role updated, but failed to load auth user for metadata sync.",
        },
        { status: 500 },
      );
    }

    const currentMetadata =
      authUser.user.user_metadata &&
      typeof authUser.user.user_metadata === "object" &&
      !Array.isArray(authUser.user.user_metadata)
        ? authUser.user.user_metadata
        : {};

    const nextMetadata = {
      ...currentMetadata,
      role: body.role,
    };

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(body.id, {
      user_metadata: nextMetadata,
    });

    if (authUpdateError) {
      return NextResponse.json(
        {
          error: `Profile role updated, but failed to sync auth metadata: ${authUpdateError.message}`,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }
  if (body.id === guard.userId) {
    return NextResponse.json({ error: "You cannot delete your own admin account." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(body.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
