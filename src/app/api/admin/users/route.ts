import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/types";
import { resolveRole } from "@/lib/auth/role";

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
  let role = resolveRole(profile?.role, user);
  if (role !== "admin") {
    const admin = createSupabaseAdminClient();
    const { data: adminProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    role = resolveRole(adminProfile?.role, user);
  }
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
  const schoolFilter = url.searchParams.get("schoolId");

  const admin = createSupabaseAdminClient();
  let userIdsForSchoolFilter: string[] | null = null;

  if (schoolFilter) {
    const [{ data: teacherLinks, error: teacherLinkError }, { data: studentLinks, error: studentLinkError }] =
      await Promise.all([
        admin.from("school_teachers").select("teacher_user_id").eq("school_id", schoolFilter),
        admin.from("school_members").select("student_user_id").eq("school_id", schoolFilter),
      ]);

    if (teacherLinkError) {
      return NextResponse.json({ error: teacherLinkError.message }, { status: 400 });
    }
    if (studentLinkError) {
      return NextResponse.json({ error: studentLinkError.message }, { status: 400 });
    }

    userIdsForSchoolFilter = Array.from(
      new Set(
        (teacherLinks ?? [])
          .map((link) => link.teacher_user_id)
          .concat((studentLinks ?? []).map((link) => link.student_user_id)),
      ),
    );

    if (userIdsForSchoolFilter.length === 0) {
      return NextResponse.json({ users: [] });
    }
  }

  let query = admin
    .from("profiles")
    .select("id,email,student_id,display_name,role,created_at")
    .order("created_at", { ascending: false });

  if (roleFilter && ["student", "teacher", "admin"].includes(roleFilter)) {
    query = query.eq("role", roleFilter as AppRole);
  }
  if (userIdsForSchoolFilter) {
    query = query.in("id", userIdsForSchoolFilter);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const users = data ?? [];
  const userIds = users.map((user) => user.id);
  if (userIds.length === 0) {
    return NextResponse.json({ users });
  }

  const [{ data: teacherLinks, error: teacherLinkError }, { data: studentLinks, error: studentLinkError }] =
    await Promise.all([
      admin.from("school_teachers").select("teacher_user_id,school_id").in("teacher_user_id", userIds),
      admin.from("school_members").select("student_user_id,school_id").in("student_user_id", userIds),
    ]);

  if (teacherLinkError) {
    return NextResponse.json({ error: teacherLinkError.message }, { status: 400 });
  }
  if (studentLinkError) {
    return NextResponse.json({ error: studentLinkError.message }, { status: 400 });
  }

  const schoolIds = Array.from(
    new Set(
      (teacherLinks ?? [])
        .map((link) => link.school_id)
        .concat((studentLinks ?? []).map((link) => link.school_id)),
    ),
  );
  const { data: schoolRows, error: schoolError } =
    schoolIds.length > 0
      ? await admin.from("schools").select("id,name").in("id", schoolIds)
      : { data: [] as Array<{ id: string; name: string }>, error: null };

  if (schoolError) {
    return NextResponse.json({ error: schoolError.message }, { status: 400 });
  }

  const schoolNameById = new Map((schoolRows ?? []).map((school) => [school.id, school.name]));
  const schoolNamesByUser = new Map<string, Set<string>>();

  for (const link of teacherLinks ?? []) {
    const schoolName = schoolNameById.get(link.school_id);
    if (!schoolName) continue;
    const existing = schoolNamesByUser.get(link.teacher_user_id) ?? new Set<string>();
    existing.add(schoolName);
    schoolNamesByUser.set(link.teacher_user_id, existing);
  }

  for (const link of studentLinks ?? []) {
    const schoolName = schoolNameById.get(link.school_id);
    if (!schoolName) continue;
    const existing = schoolNamesByUser.get(link.student_user_id) ?? new Set<string>();
    existing.add(schoolName);
    schoolNamesByUser.set(link.student_user_id, existing);
  }

  const usersWithSchools = users.map((user) => ({
    ...user,
    school_names: Array.from(schoolNamesByUser.get(user.id) ?? []).sort((a, b) => a.localeCompare(b)),
  }));

  return NextResponse.json({ users: usersWithSchools });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json()) as {
    id?: string;
    role?: AppRole;
    displayName?: string | null;
    studentId?: string | null;
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
  } = {};
  if (body.role) updatePayload.role = body.role;
  if (body.displayName !== undefined) updatePayload.display_name = body.displayName;
  if (body.studentId !== undefined) updatePayload.student_id = body.studentId;

  const { error } = await admin.from("profiles").update(updatePayload).eq("id", body.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
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
