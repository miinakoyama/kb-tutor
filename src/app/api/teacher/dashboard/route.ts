import { NextResponse } from "next/server";
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
  if (!["teacher", "admin"].includes(profile?.role ?? "")) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, userId: user.id, client: requester };
}

export async function GET() {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;

  const requester = guard.client;

  // Get classes where the current user is the teacher
  const { data: classes, error: classError } = await requester
    .from("classes")
    .select("id,name,grade")
    .eq("teacher_user_id", guard.userId);
  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 400 });
  }

  if (!classes || classes.length === 0) {
    return NextResponse.json({
      classes: [],
      metrics: [],
    });
  }

  const classIds = classes.map((c) => c.id);

  // Get student metrics for all students in the teacher's classes
  const { data: metrics, error: metricsError } = await requester
    .from("teacher_dashboard_student_metrics")
    .select("*")
    .in("class_id", classIds);

  if (metricsError) {
    return NextResponse.json({ error: metricsError.message }, { status: 400 });
  }

  // Get standard metrics for all students in the teacher's classes
  const { data: standardMetrics, error: standardError } = await requester
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
