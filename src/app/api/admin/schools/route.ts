import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";

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
  const role = await resolveRoleWithServerFallback(user, profile?.role);
  if (role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const };
}

function buildSchoolId(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `sch_${slug || "school"}_${randomUUID().slice(0, 6)}`;
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

// Accept either a plain YYYY-MM-DD string or null/empty to clear. Returns
// { ok: true, value } with the normalized value, or { ok: false, error }.
function normalizeKeystoneExamDate(
  input: unknown,
):
  | { ok: true; value: string | null }
  | { ok: false; error: string } {
  if (input === null || input === undefined || input === "") {
    return { ok: true, value: null };
  }
  if (typeof input !== "string") {
    return { ok: false, error: "keystoneExamDate must be a YYYY-MM-DD string" };
  }
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return {
      ok: false,
      error: "keystoneExamDate must be in YYYY-MM-DD format",
    };
  }
  const [y, m, d] = trimmed
    .split("-")
    .map((part) => Number.parseInt(part, 10));
  // `new Date(Date.UTC(y, m-1, d))` silently overflows for impossible dates
  // like 2026-02-31 (becomes Mar 3). Round-trip the components to reject
  // anything that did not land on the exact same calendar day.
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    return { ok: false, error: "keystoneExamDate is not a valid date" };
  }
  return { ok: true, value: trimmed };
}

const STUDENT_LOGIN_NOTICE_MAX_LEN = 2000;

function normalizeStudentLoginNotice(
  input: unknown,
):
  | { ok: true; value: string | null }
  | { ok: false; error: string } {
  if (input === null || input === undefined || input === "") {
    return { ok: true, value: null };
  }
  if (typeof input !== "string") {
    return { ok: false, error: "studentLoginNotice must be a string or null" };
  }
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > STUDENT_LOGIN_NOTICE_MAX_LEN) {
    return {
      ok: false,
      error: `studentLoginNotice must be ${STUDENT_LOGIN_NOTICE_MAX_LEN} characters or less`,
    };
  }
  return { ok: true, value: trimmed };
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createSupabaseAdminClient();
  const { data: schoolsData, error: schoolError } = await admin
    .from("schools")
    .select("id,name,teacher_user_id,keystone_exam_date,is_hidden,student_login_notice,created_at")
    .order("name", { ascending: true });
  if (schoolError) {
    return NextResponse.json({ error: schoolError.message }, { status: 400 });
  }

  const schoolIds = (schoolsData ?? []).map((s) => s.id);

  const [{ data: schoolTeachers }, { data: members }] = await Promise.all([
    schoolIds.length > 0
      ? admin
          .from("school_teachers")
          .select("school_id,teacher_user_id,teacher_role")
          .in("school_id", schoolIds)
      : Promise.resolve({ data: [] as Array<{ school_id: string; teacher_user_id: string; teacher_role: "primary" | "assistant" }> }),
    schoolIds.length > 0
      ? admin.from("school_members").select("school_id,student_user_id").in("school_id", schoolIds)
      : Promise.resolve({ data: [] as Array<{ school_id: string; student_user_id: string }> }),
  ]);

  const teacherIds = Array.from(
    new Set(
      (schoolTeachers ?? []).map((row) => row.teacher_user_id).concat(
        (schoolsData ?? []).map((row) => row.teacher_user_id),
      ),
    ),
  ).filter((id): id is string => typeof id === "string" && id.length > 0);
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
  const teachersBySchool = new Map<
    string,
    Array<{ id: string; label: string; is_primary: boolean }>
  >();
  for (const row of schoolTeachers ?? []) {
    const profile = teacherMap.get(row.teacher_user_id);
    const list = teachersBySchool.get(row.school_id) ?? [];
    list.push({
      id: row.teacher_user_id,
      label:
        profile?.display_name ||
        profile?.student_id ||
        profile?.email ||
        row.teacher_user_id,
      is_primary: row.teacher_role === "primary",
    });
    teachersBySchool.set(row.school_id, list);
  }
  const membersBySchool = new Map<string, string[]>();
  for (const row of members ?? []) {
    const list = membersBySchool.get(row.school_id) ?? [];
    list.push(row.student_user_id);
    membersBySchool.set(row.school_id, list);
  }

  const schools = (schoolsData ?? []).map((s) => {
    const teachers = teachersBySchool.get(s.id) ?? [];
    const studentUserIds = membersBySchool.get(s.id) ?? [];
    const teacherLabel =
      teachers.length > 0
        ? teachers.map((teacher) => teacher.label).join(", ")
        : (() => {
            if (!s.teacher_user_id) return "Unassigned";
            const teacher = teacherMap.get(s.teacher_user_id);
            return (
              teacher?.display_name ||
              teacher?.student_id ||
              teacher?.email ||
              "Unassigned"
            );
          })();
    return {
      id: s.id,
      name: s.name,
      created_at: s.created_at,
      teacher_user_id: s.teacher_user_id,
      keystone_exam_date: s.keystone_exam_date ?? null,
      is_hidden: s.is_hidden ?? false,
      student_login_notice: s.student_login_notice ?? null,
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

  return NextResponse.json({ schools });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json()) as {
    id?: string;
    name?: string;
    teacherUserId?: string;
    teacherUserIds?: string[];
    studentUserIds?: string[];
    keystoneExamDate?: string | null;
    isHidden?: boolean;
    studentLoginNotice?: string | null;
  };

  const schoolName = body.name?.trim();
  const teacherIds = normalizeTeacherIds(body);
  if (!schoolName) {
    return NextResponse.json({ error: "Missing required field: name" }, { status: 400 });
  }
  if (body.isHidden !== undefined && typeof body.isHidden !== "boolean") {
    return NextResponse.json({ error: "isHidden must be a boolean" }, { status: 400 });
  }
  const schoolId = body.id?.trim() || buildSchoolId(schoolName);
  const primaryTeacherId = teacherIds[0] ?? null;
  const isHidden = body.isHidden ?? false;

  let studentLoginNotice: string | null = null;
  if (body.studentLoginNotice !== undefined) {
    const normalized = normalizeStudentLoginNotice(body.studentLoginNotice);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    studentLoginNotice = normalized.value;
  }

  let keystoneExamDate: string | null = null;
  if (body.keystoneExamDate !== undefined) {
    const normalized = normalizeKeystoneExamDate(body.keystoneExamDate);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    keystoneExamDate = normalized.value;
  }

  const admin = createSupabaseAdminClient();
  const { error: schoolError } = await admin.from("schools").insert({
    id: schoolId,
    name: schoolName,
    teacher_user_id: primaryTeacherId,
    keystone_exam_date: keystoneExamDate,
    is_hidden: isHidden,
    student_login_notice: studentLoginNotice,
  });
  if (schoolError) {
    return NextResponse.json({ error: schoolError.message }, { status: 400 });
  }

  if (teacherIds.length > 0) {
    const { error: teacherError } = await admin.from("school_teachers").insert(
      teacherIds.map((teacherId, index) => ({
        school_id: schoolId,
        teacher_user_id: teacherId,
        teacher_role: index === 0 ? "primary" : "assistant",
      })),
    );
    if (teacherError) {
      return NextResponse.json({ error: teacherError.message }, { status: 400 });
    }
  }

  const studentIds = Array.from(new Set(body.studentUserIds ?? []));
  if (studentIds.length > 0) {
    const { error: memberError } = await admin.from("school_members").insert(
      studentIds.map((studentUserId) => ({
        school_id: schoolId,
        student_user_id: studentUserId,
      })),
    );
    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, id: schoolId });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json()) as {
    id?: string;
    name?: string;
    teacherUserId?: string;
    teacherUserIds?: string[];
    studentUserIds?: string[];
    keystoneExamDate?: string | null;
    isHidden?: boolean;
    studentLoginNotice?: string | null;
  };

  if (!body.id) {
    return NextResponse.json({ error: "Missing school id" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const updates: {
    name?: string;
    teacher_user_id?: string | null;
    keystone_exam_date?: string | null;
    is_hidden?: boolean;
    student_login_notice?: string | null;
  } = {};
  if (body.name !== undefined) updates.name = body.name;
  const teacherIds = normalizeTeacherIds(body);
  if (teacherIds.length > 0) updates.teacher_user_id = teacherIds[0];
  if (body.keystoneExamDate !== undefined) {
    const normalized = normalizeKeystoneExamDate(body.keystoneExamDate);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    updates.keystone_exam_date = normalized.value;
  }
  if (body.isHidden !== undefined) {
    if (typeof body.isHidden !== "boolean") {
      return NextResponse.json({ error: "isHidden must be a boolean" }, { status: 400 });
    }
    updates.is_hidden = body.isHidden;
  }
  if (body.studentLoginNotice !== undefined) {
    const normalized = normalizeStudentLoginNotice(body.studentLoginNotice);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    updates.student_login_notice = normalized.value;
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await admin
      .from("schools")
      .update(updates)
      .eq("id", body.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  }

  if (body.teacherUserId !== undefined || body.teacherUserIds !== undefined) {
    const nextTeacherIds = normalizeTeacherIds(body);
    const { error: deleteTeacherError } = await admin
      .from("school_teachers")
      .delete()
      .eq("school_id", body.id);
    if (deleteTeacherError) {
      return NextResponse.json({ error: deleteTeacherError.message }, { status: 400 });
    }
    if (nextTeacherIds.length > 0) {
      const { error: insertTeacherError } = await admin
        .from("school_teachers")
        .insert(
          nextTeacherIds.map((teacherId, index) => ({
            school_id: body.id,
            teacher_user_id: teacherId,
            teacher_role: index === 0 ? "primary" : "assistant",
          })),
        );
      if (insertTeacherError) {
        return NextResponse.json({ error: insertTeacherError.message }, { status: 400 });
      }
    }
  }

  if (body.studentUserIds !== undefined) {
    const nextIds = Array.from(new Set(body.studentUserIds));
    const { error: deleteError } = await admin
      .from("school_members")
      .delete()
      .eq("school_id", body.id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    if (nextIds.length > 0) {
      const { error: insertError } = await admin.from("school_members").insert(
        nextIds.map((studentUserId) => ({
          school_id: body.id,
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
    return NextResponse.json({ error: "Missing school id" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("schools").delete().eq("id", body.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
