import { NextResponse } from "next/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_PERFORMANCE_THRESHOLDS,
  resolvePerformanceThresholds,
  validatePerformanceThresholds,
} from "@/lib/analytics/constants";
import { loadTeacherThresholds } from "@/lib/analytics/teacher-thresholds";

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

interface ThresholdsBody {
  student?: {
    basicMin: number;
    proficientMin: number;
    advancedMin: number;
  };
  standard?: {
    basicMin: number;
    proficientMin: number;
    advancedMin: number;
  };
}

type ParseBodyResult =
  | { ok: true; body: ThresholdsBody }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseThresholdGroup(
  raw: unknown,
  scope: "student" | "standard",
): ThresholdsBody["student"] | string | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) return `${scope} must be an object.`;

  const keys = ["basicMin", "proficientMin", "advancedMin"] as const;
  const values: Partial<ThresholdsBody["student"]> = {};
  for (const key of keys) {
    const value = raw[key];
    if (value === undefined) return `Missing ${scope}.${key}.`;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return `${scope}.${key} must be a finite number.`;
    }
    values[key] = value;
  }

  return values as ThresholdsBody["student"];
}

function parseBody(raw: unknown): ParseBodyResult {
  if (!isRecord(raw)) {
    return { ok: false, error: "Request body must be an object." };
  }

  const student = parseThresholdGroup(raw.student, "student");
  if (typeof student === "string") return { ok: false, error: student };
  const standard = parseThresholdGroup(raw.standard, "standard");
  if (typeof standard === "string") return { ok: false, error: standard };
  if (!student && !standard) {
    return {
      ok: false,
      error: "Missing thresholds. Provide student or standard thresholds.",
    };
  }

  return { ok: true, body: { student, standard } };
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
  const parsed = parseBody(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const resolved = resolvePerformanceThresholds(parsed.body);
  const validationError = validatePerformanceThresholds(resolved);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("teacher_performance_thresholds")
    .upsert(
      {
        user_id: guard.userId,
        student_basic_min: resolved.student.basicMin,
        student_proficient_min: resolved.student.proficientMin,
        student_advanced_min: resolved.student.advancedMin,
        standard_basic_min: resolved.standard.basicMin,
        standard_proficient_min: resolved.standard.proficientMin,
        standard_advanced_min: resolved.standard.advancedMin,
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
