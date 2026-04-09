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
  const teacherIds = Array.from(new Set((classesData ?? []).map((c) => c.teacher_user_id)));

  const [{ data: teacherProfiles }, { data: members }] = await Promise.all([
    teacherIds.length > 0
      ? admin
          .from("profiles")
          .select("id,display_name,student_id,email")
          .in("id", teacherIds)
      : Promise.resolve({ data: [] as Array<{ id: string; display_name: string | null; student_id: string | null; email: string }> }),
    classIds.length > 0
      ? admin.from("class_members").select("class_id,student_user_id").in("class_id", classIds)
      : Promise.resolve({ data: [] as Array<{ class_id: string; student_user_id: string }> }),
  ]);

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
  const membersByClass = new Map<string, string[]>();
  for (const row of members ?? []) {
    const list = membersByClass.get(row.class_id) ?? [];
    list.push(row.student_user_id);
    membersByClass.set(row.class_id, list);
  }

  const classes = (classesData ?? []).map((c) => {
    const teacher = teacherMap.get(c.teacher_user_id);
    const studentUserIds = membersByClass.get(c.id) ?? [];
    return {
      id: c.id,
      name: c.name,
      grade: c.grade,
      created_at: c.created_at,
      teacher_user_id: c.teacher_user_id,
      teacher_label: teacher?.display_name || teacher?.student_id || teacher?.email || c.teacher_user_id,
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
    studentUserIds?: string[];
  };

  if (!body.id || !body.name || !body.teacherUserId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error: classError } = await admin.from("classes").insert({
    id: body.id,
    name: body.name,
    grade: body.grade ?? null,
    teacher_user_id: body.teacherUserId,
  });
  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 400 });
  }

  const studentIds = Array.from(new Set(body.studentUserIds ?? []));
  if (studentIds.length > 0) {
    const { error: memberError } = await admin.from("class_members").insert(
      studentIds.map((studentUserId) => ({
        class_id: body.id,
        student_user_id: studentUserId,
      })),
    );
    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json()) as {
    id?: string;
    name?: string;
    grade?: number | null;
    teacherUserId?: string;
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
  if (body.teacherUserId !== undefined) updates.teacher_user_id = body.teacherUserId;

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await admin
      .from("classes")
      .update(updates)
      .eq("id", body.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
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

