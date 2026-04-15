import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRole } from "@/lib/auth/role";
import type { AppRole } from "@/lib/auth/types";

async function requireTeacher() {
  const requester = await createSupabaseServerClient();
  const {
    data: { user },
  } = await requester.auth.getUser();
  if (!user) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await requester
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  let role = resolveRole(profile?.role, user);
  if (!role) {
    const admin = createSupabaseAdminClient();
    const { data: adminProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    role = resolveRole(adminProfile?.role, user);
  }
  if (!role || !["teacher", "admin"].includes(role)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, userId: user.id, role: role as AppRole };
}

async function getTeacherScopedSchoolIds(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  teacherUserId: string,
) {
  const [{ data: schoolTeachers }, { data: legacySchools }] = await Promise.all([
    admin
      .from("school_teachers")
      .select("school_id")
      .eq("teacher_user_id", teacherUserId),
    admin
      .from("schools")
      .select("id")
      .eq("teacher_user_id", teacherUserId),
  ]);
  return Array.from(
    new Set([
      ...(schoolTeachers ?? []).map((row) => row.school_id),
      ...(legacySchools ?? []).map((row) => row.id),
    ]),
  );
}

export async function GET() {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;

  const admin = createSupabaseAdminClient();
  const scopedSchoolIds =
    guard.role === "teacher"
      ? await getTeacherScopedSchoolIds(admin, guard.userId)
      : null;

  const schoolsQuery =
    guard.role === "teacher" && scopedSchoolIds
      ? scopedSchoolIds.length === 0
        ? null
        : admin
            .from("schools")
            .select("id,name,teacher_user_id,created_at")
            .in("id", scopedSchoolIds)
            .order("name", { ascending: true })
      : admin
          .from("schools")
          .select("id,name,teacher_user_id,created_at")
          .order("name", { ascending: true });

  const { data: schoolsData, error: schoolError } = schoolsQuery
    ? await schoolsQuery
    : { data: [], error: null as null | { message: string } };
  if (schoolError) {
    return NextResponse.json({ error: schoolError.message }, { status: 400 });
  }

  const schoolIds = (schoolsData ?? []).map((row) => row.id);
  const { data: members, error: memberError } =
    schoolIds.length > 0
      ? await admin
          .from("school_members")
          .select("school_id,student_user_id")
          .in("school_id", schoolIds)
      : { data: [], error: null as null | { message: string } };
  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 400 });
  }

  const memberCountBySchool = new Map<string, number>();
  for (const row of members ?? []) {
    memberCountBySchool.set(
      row.school_id,
      (memberCountBySchool.get(row.school_id) ?? 0) + 1,
    );
  }

  return NextResponse.json({
    schools: (schoolsData ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      teacher_user_id: row.teacher_user_id,
      created_at: row.created_at,
      member_count: memberCountBySchool.get(row.id) ?? 0,
    })),
  });
}
