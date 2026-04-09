import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRole } from "@/lib/auth/role";

async function requireAdmin() {
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
  return { ok: true as const };
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

function normalizeTeacherIds(body: {
  teacherUserId?: string;
  teacherUserIds?: string[];
}) {
  if (Array.isArray(body.teacherUserIds) && body.teacherUserIds.length > 0) {
    return Array.from(
      new Set(body.teacherUserIds.map((id) => id.trim()).filter(Boolean)),
    );
  }
  if (body.teacherUserId?.trim()) {
    return [body.teacherUserId.trim()];
  }
  return [];
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createSupabaseAdminClient();
  const { data: classesData, error: classError } = await admin
    .from("classes")
    .select("id,name,grade,teacher_user_id,created_at")
    .order("name", { ascending: true });
  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 400 });
  }

  const classIds = (classesData ?? []).map((c) => c.id);

  const [{ data: classTeachers }, { data: members }] = await Promise.all([
    classIds.length > 0
      ? admin
          .from("class_teachers")
          .select("class_id,teacher_user_id,teacher_role")
          .in("class_id", classIds)
      : Promise.resolve({ data: [] as Array<{ class_id: string; teacher_user_id: string; teacher_role: "primary" | "assistant" }> }),
    classIds.length > 0
      ? admin.from("class_members").select("class_id,student_user_id").in("class_id", classIds)
      : Promise.resolve({ data: [] as Array<{ class_id: string; student_user_id: string }> }),
  ]);

  const teacherIds = Array.from(
    new Set(
      (classTeachers ?? []).map((row) => row.teacher_user_id).concat(
        (classesData ?? []).map((row) => row.teacher_user_id),
      ),
    ),
  );
  const { data: teacherProfiles } =
    teacherIds.length > 0
      ? await admin
          .from("profiles")
          .select("id,display_name,student_id,email")
          .in("id", teacherIds)
      : {
          data: [] as Array<{
            id: string;
            display_name: string | null;
            student_id: string | null;
            email: string;
          }>,
        };

  const studentIds = Array.from(
    new Set((members ?? []).map((m) => m.student_user_id)),
  );
  const { data: studentProfiles } =
    studentIds.length > 0
      ? await admin
          .from("profiles")
          .select("id,display_name,student_id,email")
          .in("id", studentIds)
      : { data: [] as Array<{ id: string; display_name: string | null; student_id: string | null; email: string }> };

  const teacherMap = new Map((teacherProfiles ?? []).map((p) => [p.id, p]));
  const studentMap = new Map((studentProfiles ?? []).map((p) => [p.id, p]));
  const teachersByClass = new Map<
    string,
    Array<{ id: string; label: string; is_primary: boolean }>
  >();
  for (const row of classTeachers ?? []) {
    const profile = teacherMap.get(row.teacher_user_id);
    const list = teachersByClass.get(row.class_id) ?? [];
    list.push({
      id: row.teacher_user_id,
      label:
        profile?.display_name ||
        profile?.student_id ||
        profile?.email ||
        row.teacher_user_id,
      is_primary: row.teacher_role === "primary",
    });
    teachersByClass.set(row.class_id, list);
  }
  const membersByClass = new Map<string, string[]>();
  for (const row of members ?? []) {
    const list = membersByClass.get(row.class_id) ?? [];
    list.push(row.student_user_id);
    membersByClass.set(row.class_id, list);
  }

  const classes = (classesData ?? []).map((c) => {
    const teachers = teachersByClass.get(c.id) ?? [];
    const studentUserIds = membersByClass.get(c.id) ?? [];
    const teacherLabel =
      teachers.length > 0
        ? teachers.map((teacher) => teacher.label).join(", ")
        : (() => {
            const teacher = teacherMap.get(c.teacher_user_id);
            return (
              teacher?.display_name ||
              teacher?.student_id ||
              teacher?.email ||
              c.teacher_user_id
            );
          })();
    return {
      id: c.id,
      name: c.name,
      grade: c.grade,
      created_at: c.created_at,
      teacher_user_id: c.teacher_user_id,
      teacher_label: teacherLabel,
      teachers,
      students: studentUserIds.map((id) => {
        const profile = studentMap.get(id);
        return {
          id,
          label: profile?.display_name || profile?.student_id || profile?.email || id,
        };
      }),
    };
  });

  return NextResponse.json({ classes });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json()) as {
    id?: string;
    name?: string;
    grade?: number | null;
    teacherUserId?: string;
    teacherUserIds?: string[];
    studentUserIds?: string[];
  };

  const className = body.name?.trim();
  const teacherIds = normalizeTeacherIds(body);
  if (!className || teacherIds.length === 0) {
    return NextResponse.json({ error: "Missing required fields: name, teacherUserIds" }, { status: 400 });
  }
  const classId = body.id?.trim() || buildClassId(className);
  const primaryTeacherId = teacherIds[0];

  const admin = createSupabaseAdminClient();
  const { error: classError } = await admin.from("classes").insert({
    id: classId,
    name: className,
    grade: body.grade ?? null,
    teacher_user_id: primaryTeacherId,
  });
  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 400 });
  }

  const { error: teacherError } = await admin.from("class_teachers").insert(
    teacherIds.map((teacherId, index) => ({
      class_id: classId,
      teacher_user_id: teacherId,
      teacher_role: index === 0 ? "primary" : "assistant",
    })),
  );
  if (teacherError) {
    return NextResponse.json({ error: teacherError.message }, { status: 400 });
  }

  const studentIds = Array.from(new Set(body.studentUserIds ?? []));
  if (studentIds.length > 0) {
    const { error: memberError } = await admin.from("class_members").insert(
      studentIds.map((studentUserId) => ({
        class_id: classId,
        student_user_id: studentUserId,
      })),
    );
    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, id: classId });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json()) as {
    id?: string;
    name?: string;
    grade?: number | null;
    teacherUserId?: string;
    teacherUserIds?: string[];
    studentUserIds?: string[];
  };

  if (!body.id) {
    return NextResponse.json({ error: "Missing class id" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const updates: {
    name?: string;
    grade?: number | null;
    teacher_user_id?: string;
  } = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.grade !== undefined) updates.grade = body.grade;
  const teacherIds = normalizeTeacherIds(body);
  if (teacherIds.length > 0) updates.teacher_user_id = teacherIds[0];

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await admin
      .from("classes")
      .update(updates)
      .eq("id", body.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  }

  if (
    body.teacherUserId !== undefined ||
    body.teacherUserIds !== undefined
  ) {
    const nextTeacherIds = normalizeTeacherIds(body);
    if (nextTeacherIds.length === 0) {
      return NextResponse.json({ error: "At least one teacher is required." }, { status: 400 });
    }
    const { error: deleteTeacherError } = await admin
      .from("class_teachers")
      .delete()
      .eq("class_id", body.id);
    if (deleteTeacherError) {
      return NextResponse.json({ error: deleteTeacherError.message }, { status: 400 });
    }
    const { error: insertTeacherError } = await admin
      .from("class_teachers")
      .insert(
        nextTeacherIds.map((teacherId, index) => ({
          class_id: body.id,
          teacher_user_id: teacherId,
          teacher_role: index === 0 ? "primary" : "assistant",
        })),
      );
    if (insertTeacherError) {
      return NextResponse.json({ error: insertTeacherError.message }, { status: 400 });
    }
  }

  if (body.studentUserIds) {
    const nextIds = Array.from(new Set(body.studentUserIds));
    const { error: deleteError } = await admin
      .from("class_members")
      .delete()
      .eq("class_id", body.id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    if (nextIds.length > 0) {
      const { error: insertError } = await admin.from("class_members").insert(
        nextIds.map((studentUserId) => ({
          class_id: body.id,
          student_user_id: studentUserId,
        })),
      );
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "Missing class id" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("classes").delete().eq("id", body.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

