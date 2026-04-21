import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface EndSessionBody {
  endedAt?: string;
}

async function updateSessionEndedAt(
  sessionId: string,
  userId: string,
  endedAt: string,
) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("analytics_sessions")
    .update({ ended_at: endedAt })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .is("ended_at", null);
  return error;
}

async function authAndEnd(
  sessionId: string,
  body: EndSessionBody,
): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const endedAt = body.endedAt ?? new Date().toISOString();
  const error = await updateSessionEndedAt(sessionId, user.id, endedAt);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const body = (await request.json().catch(() => ({}))) as EndSessionBody;
  return authAndEnd(sessionId, body);
}

/**
 * `navigator.sendBeacon` only supports POST, so we accept POST as a tunneled
 * PATCH when the `_method=PATCH` query string is set. The client-side session
 * manager uses this fallback in `beforeunload` / `pagehide` handlers.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const url = new URL(request.url);
  if (url.searchParams.get("_method") !== "PATCH") {
    return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
  }
  const body = (await request.json().catch(() => ({}))) as EndSessionBody;
  return authAndEnd(sessionId, body);
}
