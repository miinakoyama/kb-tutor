import { randomUUID } from "crypto";
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

function buildClassId(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `cls_${slug || "class"}_${randomUUID().slice(0, 6)}`;
}

async function getTeacherScopedClassIds(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  teacherUserId: string,
) {
  const [{ data: classTeachers }, { data: legacyClasses }] = await Promise.all([
    admin
      .from("class_teachers")
      .select("class_id")
      .eq("teacher_user_id", teacherUserId),
    admin
      .from("classes")
      .select("id")
      .eq("teacher_user_id", teacherUserId),
  ]);
  return Array.from(
    new Set([
      ...(classTeachers ?? []).map((row) => row.class_id),
      ...(legacyClasses ?? []).map((row) => row.id),
    ]),
  );
}

export async function GET() {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;

  const admin = createSupabaseAdminClient();
  const scopedClassIds =
    guard.role === "teacher"
      ? await getTeacherScopedClassIds(admin, guard.userId)
      : null;

  const classesQuery =
    guard.role === "teacher" && scopedClassIds
      ? scopedClassIds.length === 0
        ? null
        : admin
            .from("classes")
            .select("id,name,grade,teacher_user_id,created_at")
            .in("id", scopedClassIds)
            .order("name", { ascending: true })
      : admin
          .from("classes")
          .select("id,name,grade,teacher_user_id,created_at")
          .order("name", { ascending: true });

  const { data: classesData, error: classError } = classesQuery
    ? await classesQuery
    : { data: [], error: null as null | { message: string } };
  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 400 });
  }

  const classIds = (classesData ?? []).map((row) => row.id);
  const { data: members, error: memberError } =
    classIds.length > 0
      ? await admin
          .from("class_members")
          .select("class_id,student_user_id")
          .in("class_id", classIds)
      : { data: [], error: null as null | { message: string } };
  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 400 });
  }

  const memberCountByClass = new Map<string, number>();
  for (const row of members ?? []) {
    memberCountByClass.set(
      row.class_id,
      (memberCountByClass.get(row.class_id) ?? 0) + 1,
    );
  }

  return NextResponse.json({
    classes: (classesData ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      grade: row.grade,
      teacher_user_id: row.teacher_user_id,
      created_at: row.created_at,
      member_count: memberCountByClass.get(row.id) ?? 0,
    })),
  });
}

export async function POST(request: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;

  const body = (await request.json()) as {
    id?: string;
    name?: string;
    grade?: number | null;
  };

  const className = body.name?.trim();
  if (!className) {
    return NextResponse.json({ error: "Missing required field: name" }, { status: 400 });
  }
  const classId = body.id?.trim() || buildClassId(className);

  const admin = createSupabaseAdminClient();
  const { error: classError } = await admin.from("classes").insert({
    id: classId,
    name: className,
    grade: body.grade ?? null,
    teacher_user_id: guard.userId,
  });
  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 400 });
  }

  const { error: teacherError } = await admin.from("class_teachers").insert({
    class_id: classId,
    teacher_user_id: guard.userId,
    teacher_role: "primary",
  });
  if (teacherError) {
    return NextResponse.json({ error: teacherError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: classId });
}

export async function PATCH(request: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;

  const body = (await request.json()) as {
    id?: string;
    name?: string;
    grade?: number | null;
  };

  if (!body.id) {
    return NextResponse.json({ error: "Missing class id" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("classes")
    .select("id,teacher_user_id")
    .eq("id", body.id)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }
  if (guard.role === "teacher") {
    const scopedClassIds = await getTeacherScopedClassIds(admin, guard.userId);
    if (!scopedClassIds.includes(body.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const updates: { name?: string; grade?: number | null } = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.grade !== undefined) updates.grade = body.grade;

  const { error: updateError } = await admin
    .from("classes")
    .update(updates)
    .eq("id", body.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;

  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "Missing class id" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("classes")
    .select("id,teacher_user_id")
    .eq("id", body.id)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }
  if (guard.role === "teacher") {
    const scopedClassIds = await getTeacherScopedClassIds(admin, guard.userId);
    if (!scopedClassIds.includes(body.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { error } = await admin.from("classes").delete().eq("id", body.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
