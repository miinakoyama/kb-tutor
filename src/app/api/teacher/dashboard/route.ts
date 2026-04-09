import { NextResponse } from "next/server";
import { resolveRole } from "@/lib/auth/role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  const role = resolveRole(profile?.role, user);
  if (!role || !["teacher", "admin"].includes(role)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, userId: user.id, role };
}

export async function GET() {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;
  const admin = createSupabaseAdminClient();

  let classes:
    | Array<{ id: string; name: string; grade: number | null }>
    | null = null;
  let classQueryError: string | null = null;
  if (guard.role === "teacher") {
    const [{ data: classTeachers, error: classTeachersError }, { data: legacyClasses, error: legacyClassesError }] = await Promise.all([
      admin
        .from("class_teachers")
        .select("class_id")
        .eq("teacher_user_id", guard.userId),
      admin.from("classes").select("id").eq("teacher_user_id", guard.userId),
    ]);
    if (classTeachersError) classQueryError = classTeachersError.message;
    if (legacyClassesError) classQueryError = legacyClassesError.message;
    const classIds = Array.from(
      new Set([
        ...(classTeachers ?? []).map((row) => row.class_id),
        ...(legacyClasses ?? []).map((row) => row.id),
      ]),
    );
    if (classIds.length === 0) {
      classes = [];
    } else {
      const { data, error } = await admin
        .from("classes")
        .select("id,name,grade")
        .in("id", classIds);
      classes = data;
      if (error) classQueryError = error.message;
    }
  } else {
    const { data, error } = await admin.from("classes").select("id,name,grade");
    classes = data;
    if (error) classQueryError = error.message;
  }
  if (classQueryError) {
    return NextResponse.json({ error: classQueryError }, { status: 400 });
  }

  if (!classes || classes.length === 0) {
    return NextResponse.json({
      classes: [],
      metrics: [],
    });
  }

  const classIds = classes.map((c) => c.id);

  // Get student metrics for all students in the teacher's classes
  const { data: metrics, error: metricsError } = await admin
    .from("teacher_dashboard_student_metrics")
    .select("*")
    .in("class_id", classIds);

  if (metricsError) {
    return NextResponse.json({ error: metricsError.message }, { status: 400 });
  }

  // Get standard metrics for all students in the teacher's classes
  const { data: standardMetrics, error: standardError } = await admin
    .from("teacher_dashboard_standard_metrics")
    .select("*")
    .in("class_id", classIds);

  if (standardError) {
    return NextResponse.json({ error: standardError.message }, { status: 400 });
  }

  return NextResponse.json({
    classes,
    metrics: metrics ?? [],
    standardMetrics: standardMetrics ?? [],
  });
}
