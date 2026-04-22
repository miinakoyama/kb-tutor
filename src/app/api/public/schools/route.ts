import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// No auth required — used by the student login page to populate the school dropdown
export async function GET() {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("schools")
      .select("id,name,student_id_validation_pattern,student_id_validation_hint")
      .eq("is_hidden", false)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ schools: data ?? [] });
  } catch {
    return NextResponse.json(
      { error: "Failed to load schools." },
      { status: 500 },
    );
  }
}
