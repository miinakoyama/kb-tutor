import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface CreateSessionBody {
  mode?: string;
  clientStartedAt?: string;
  timezone?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  assignmentId?: string;
}

const ALLOWED_MODES = new Set(["practice", "exam", "review", "assignment"]);

async function resolveSchoolIdForUser(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("school_members")
    .select("school_id")
    .eq("student_user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) return { schoolId: null, error };
  return { schoolId: data?.school_id ?? null, error: null };
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateSessionBody;
  if (!body.mode || !ALLOWED_MODES.has(body.mode)) {
    return NextResponse.json(
      { error: `Invalid mode: ${body.mode ?? "<missing>"}` },
      { status: 400 },
    );
  }

  const schoolResult = await resolveSchoolIdForUser(user.id);
  if (schoolResult.error) {
    return NextResponse.json({ error: schoolResult.error.message }, { status: 400 });
  }
  if (!schoolResult.schoolId) {
    return NextResponse.json(
      { error: "No school membership found for user" },
      { status: 400 },
    );
  }

  const roleFromMeta =
    (user.user_metadata?.role as string | undefined) ??
    (user.app_metadata?.role as string | undefined) ??
    null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("analytics_sessions")
    .insert({
      school_id: schoolResult.schoolId,
      user_id: user.id,
      role: roleFromMeta,
      mode: body.mode,
      client_started_at: body.clientStartedAt ?? null,
      timezone: body.timezone ?? null,
      device_type: body.deviceType ?? null,
      browser: body.browser ?? null,
      os: body.os ?? null,
    })
    .select("id, started_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create session" },
      { status: 400 },
    );
  }

  return NextResponse.json({ id: data.id, startedAt: data.started_at });
}
