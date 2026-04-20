import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: user.id, notifications_last_read_at: now },
      { onConflict: "user_id" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Invalidate the router cache for pages that derive unread state from the
  // freshly-updated timestamp so subsequent navigations re-render server-side.
  revalidatePath("/");
  revalidatePath("/notifications");

  return NextResponse.json({ ok: true, notifications_last_read_at: now });
}
