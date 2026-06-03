import { NextResponse } from "next/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_PERFORMANCE_THRESHOLDS,
  isDefaultPerformanceThresholds,
  resolvePerformanceThresholds,
  validatePerformanceThresholds,
} from "@/lib/analytics/constants";
import { loadTeacherThresholds } from "@/lib/analytics/teacher-thresholds";
import { parsePerformanceThresholdsBody } from "@/lib/analytics/performance-thresholds-body";

async function requireTeacher() {
  const requester = await createSupabaseServerClient();
  const {
    data: { user },
  } = await requester.auth.getUser();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const { data: profile } = await requester
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, profile?.role);
  if (!role || !["teacher", "admin"].includes(role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, userId: user.id };
}

export async function GET() {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;
  const { thresholds, isCustom } = await loadTeacherThresholds(guard.userId);
  return NextResponse.json({
    thresholds,
    defaults: DEFAULT_PERFORMANCE_THRESHOLDS,
    isCustom,
  });
}

export async function PUT(request: Request) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parsePerformanceThresholdsBody(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const validationError = validatePerformanceThresholds(parsed.body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const resolved = resolvePerformanceThresholds(parsed.body);
  const matchesDefaults = isDefaultPerformanceThresholds(resolved);

  const admin = createSupabaseAdminClient();
  if (matchesDefaults) {
    const { error } = await admin
      .from("teacher_performance_thresholds")
      .delete()
      .eq("user_id", guard.userId);
    if (error) {
      console.error("[performance-thresholds] delete on default save failed", error);
      return NextResponse.json(
        { error: "Failed to save thresholds" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      thresholds: DEFAULT_PERFORMANCE_THRESHOLDS,
      defaults: DEFAULT_PERFORMANCE_THRESHOLDS,
      isCustom: false,
    });
  }

  const { error } = await admin
    .from("teacher_performance_thresholds")
    .upsert(
      {
        user_id: guard.userId,
        student_basic_min: resolved.basicMin,
        student_proficient_min: resolved.proficientMin,
        student_advanced_min: resolved.advancedMin,
        standard_basic_min: resolved.basicMin,
        standard_proficient_min: resolved.proficientMin,
        standard_advanced_min: resolved.advancedMin,
      },
      { onConflict: "user_id" },
    );
  if (error) {
    console.error("[performance-thresholds] upsert failed", error);
    return NextResponse.json(
      { error: "Failed to save thresholds" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    thresholds: resolved,
    defaults: DEFAULT_PERFORMANCE_THRESHOLDS,
    isCustom: true,
  });
}

export async function DELETE() {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("teacher_performance_thresholds")
    .delete()
    .eq("user_id", guard.userId);
  if (error) {
    console.error("[performance-thresholds] delete failed", error);
    return NextResponse.json(
      { error: "Failed to reset thresholds" },
      { status: 500 },
    );
  }
  return NextResponse.json({
    thresholds: DEFAULT_PERFORMANCE_THRESHOLDS,
    defaults: DEFAULT_PERFORMANCE_THRESHOLDS,
    isCustom: false,
  });
}
