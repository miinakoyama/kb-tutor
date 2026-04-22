import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface EventBody {
  eventType?: string;
  mode?: string;
  questionId?: string;
  assignmentId?: string;
  sessionId?: string;
  occurredAt?: string;
  payload?: Record<string, unknown>;
  clientEventId?: string;
}

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

  const body = (await request.json()) as EventBody;
  if (!body.eventType) {
    return NextResponse.json({ error: "Missing eventType" }, { status: 400 });
  }

  const schoolResult = await resolveSchoolIdForUser(user.id);
  if (schoolResult.error) {
    return NextResponse.json({ error: schoolResult.error.message }, { status: 400 });
  }
  if (!schoolResult.schoolId) {
    return NextResponse.json({ error: "No school membership found for user" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("analytics_events").insert({
    school_id: schoolResult.schoolId,
    user_id: user.id,
    session_id: body.sessionId ?? null,
    event_type: body.eventType,
    mode: body.mode ?? null,
    question_id: body.questionId ?? null,
    assignment_id: body.assignmentId ?? null,
    occurred_at: body.occurredAt ?? new Date().toISOString(),
    payload: body.payload ?? null,
    client_event_id: body.clientEventId ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
