import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRequester, getScopedSchoolIds } from "@/lib/assignments/manage-helpers";
import {
  GRADING_MODELS,
  METHOD_LABELS,
  METHOD_RECOMMENDED_DEFAULTS,
  findGradingModelById,
  isGradingMethod,
  isValidTemperature,
} from "@/lib/llm/models";
import { HARDCODED_FALLBACK } from "@/lib/short-answer/settings";
import type { GradingMethod } from "@/types/short-answer";

interface SettingRow {
  scope: "school" | "default";
  school_id: string | null;
  method: string;
  model_id: string;
  temperature: number | string;
}

function toConfig(row: SettingRow | null | undefined) {
  if (!row) return null;
  return {
    method: row.method as GradingMethod,
    modelId: row.model_id,
    temperature: Number(row.temperature),
  };
}

export async function GET() {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requester.role || !["teacher", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const scoped = await getScopedSchoolIds(admin, requester);
  if ("error" in scoped && scoped.error) {
    return NextResponse.json({ error: scoped.error }, { status: 400 });
  }
  const schools = scoped.schools;
  const schoolIds = schools.map((s) => s.id);

  const { data: rows, error } = await admin
    .from("feedback_settings")
    .select("scope, school_id, method, model_id, temperature");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const allRows = (rows ?? []) as SettingRow[];

  const defaultRow = allRows.find((r) => r.scope === "default") ?? null;
  const defaultConfig = toConfig(defaultRow) ?? HARDCODED_FALLBACK;

  const bySchool = new Map(
    allRows
      .filter((r) => r.scope === "school" && r.school_id)
      .map((r) => [r.school_id as string, r]),
  );

  const methods = (Object.keys(METHOD_LABELS) as GradingMethod[]).map((method) => ({
    method,
    label: METHOD_LABELS[method],
    recommended: METHOD_RECOMMENDED_DEFAULTS[method],
  }));

  return NextResponse.json({
    methods,
    models: GRADING_MODELS,
    default: { ...defaultConfig, editable: requester.role === "admin" },
    schools: schools
      .filter((s) => schoolIds.includes(s.id))
      .map((s) => {
        const setting = toConfig(bySchool.get(s.id));
        return {
          schoolId: s.id,
          schoolName: s.name,
          setting,
          inherited: setting === null,
        };
      }),
  });
}

interface PutBody {
  scope: "school" | "default";
  schoolId?: string;
  method?: string;
  modelId?: string;
  temperature?: number;
  reset?: boolean;
}

export async function PUT(request: Request) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requester.role || !["teacher", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = raw as PutBody;

  if (body.scope !== "school" && body.scope !== "default") {
    return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  }
  if (body.scope === "default" && requester.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can edit the default configuration" },
      { status: 403 },
    );
  }

  const admin = createSupabaseAdminClient();

  // School-scope writes require membership (admins bypass).
  if (body.scope === "school") {
    if (typeof body.schoolId !== "string" || !body.schoolId) {
      return NextResponse.json({ error: "Missing schoolId" }, { status: 400 });
    }
    if (requester.role === "teacher") {
      const scoped = await getScopedSchoolIds(admin, requester);
      if ("error" in scoped && scoped.error) {
        return NextResponse.json({ error: scoped.error }, { status: 400 });
      }
      if (!scoped.schools.some((s) => s.id === body.schoolId)) {
        return NextResponse.json(
          { error: "You do not have access to this school." },
          { status: 403 },
        );
      }
    }

    if (body.reset === true) {
      const { error } = await admin
        .from("feedback_settings")
        .delete()
        .eq("scope", "school")
        .eq("school_id", body.schoolId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, reset: true });
    }
  }

  if (!isGradingMethod(body.method)) {
    return NextResponse.json({ error: "Invalid method" }, { status: 400 });
  }
  if (typeof body.modelId !== "string" || !findGradingModelById(body.modelId)) {
    return NextResponse.json({ error: "Invalid modelId" }, { status: 400 });
  }
  if (!isValidTemperature(body.temperature)) {
    return NextResponse.json(
      { error: "temperature must be a number between 0 and 2" },
      { status: 400 },
    );
  }

  const rowValues = {
    scope: body.scope,
    school_id: body.scope === "school" ? body.schoolId : null,
    method: body.method,
    model_id: body.modelId,
    temperature: body.temperature,
    updated_by: requester.id,
    updated_at: new Date().toISOString(),
  };
  const onConflict = body.scope === "school" ? "school_id" : undefined;

  const { error } = onConflict
    ? await admin.from("feedback_settings").upsert(rowValues, { onConflict })
    : await upsertDefaultRow(admin, rowValues);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    setting: {
      method: body.method,
      modelId: body.modelId,
      temperature: body.temperature,
    },
  });
}

// The default row has no natural unique column for onConflict (school_id is
// NULL), so update-then-insert keeps the single-default invariant.
async function upsertDefaultRow(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  values: Record<string, unknown>,
): Promise<{ error: { message: string } | null }> {
  const { data: existing } = await admin
    .from("feedback_settings")
    .select("id")
    .eq("scope", "default")
    .maybeSingle();
  if (existing?.id) {
    return admin.from("feedback_settings").update(values).eq("id", existing.id);
  }
  return admin.from("feedback_settings").insert(values);
}
