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

  let schoolIds: string[] = [];
  let schoolQueryError: string | null = null;

  if (guard.role === "teacher") {
    const [{ data: schoolTeachers, error: schoolTeachersError }, { data: legacySchools, error: legacyError }] = await Promise.all([
      admin
        .from("school_teachers")
        .select("school_id")
        .eq("teacher_user_id", guard.userId),
      admin.from("schools").select("id").eq("teacher_user_id", guard.userId),
    ]);
    if (schoolTeachersError) schoolQueryError = schoolTeachersError.message;
    if (legacyError) schoolQueryError = legacyError.message;
    schoolIds = Array.from(
      new Set([
        ...(schoolTeachers ?? []).map((row) => row.school_id),
        ...(legacySchools ?? []).map((row) => row.id),
      ]),
    );
  } else {
    const { data, error } = await admin.from("schools").select("id");
    if (error) schoolQueryError = error.message;
    schoolIds = (data ?? []).map((row) => row.id);
  }

  if (schoolQueryError) {
    return NextResponse.json({ error: schoolQueryError }, { status: 400 });
  }

  if (schoolIds.length === 0) {
    return NextResponse.json({ schools: [], metrics: [], standardMetrics: [] });
  }

  const { data: schoolsData, error: schoolsError } = await admin
    .from("schools")
    .select("id,name")
    .in("id", schoolIds);
  if (schoolsError) {
    return NextResponse.json({ error: schoolsError.message }, { status: 400 });
  }

  const { data: metrics, error: metricsError } = await admin
    .from("teacher_dashboard_student_metrics")
    .select("*")
    .eq("teacher_user_id", guard.userId);
  if (metricsError) {
    return NextResponse.json({ error: metricsError.message }, { status: 400 });
  }

  const { data: standardMetrics, error: standardError } = await admin
    .from("teacher_dashboard_standard_metrics")
    .select("*")
    .eq("teacher_user_id", guard.userId);
  if (standardError) {
    return NextResponse.json({ error: standardError.message }, { status: 400 });
  }

  return NextResponse.json({
    schools: schoolsData ?? [],
    metrics: metrics ?? [],
    standardMetrics: standardMetrics ?? [],
  });
}
