import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRequester, getScopedSchoolIds } from "@/lib/assignments/manage-helpers";

type QuestionSetRow = {
  schoolId: string;
  setId: string;
  setName: string;
  generatedAt: string;
  generationModelId?: string;
  generationModelLabel?: string;
  creatorUserId: string;
  creatorName: string;
  ownedByRequester: boolean;
};

export async function GET(request: NextRequest) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requester.role || !["teacher", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const schoolId = new URL(request.url).searchParams.get("schoolId")?.trim();
  if (!schoolId) {
    return NextResponse.json({ error: "Missing schoolId." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const schoolResult = await getScopedSchoolIds(admin, requester);
  if ("error" in schoolResult) {
    return NextResponse.json({ error: schoolResult.error }, { status: 400 });
  }
  if (!schoolResult.schools.some((school) => school.id === schoolId)) {
    return NextResponse.json(
      { error: "You do not have access to this school." },
      { status: 403 },
    );
  }

  const { data: links, error: linkError } = await admin
    .from("school_question_sets")
    .select("school_id,set_id")
    .eq("school_id", schoolId);

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 400 });
  }

  const setIds = Array.from(
    new Set((links ?? []).map((row) => String(row.set_id))),
  );
  if (setIds.length === 0) {
    return NextResponse.json({ rows: [] });
  }

  const { data: sets, error: setsError } = await admin
    .from("generated_question_sets")
    .select("id,name,user_id,generated_at,generation_model_id,generation_model_label")
    .in("id", setIds);
  if (setsError) {
    return NextResponse.json({ error: setsError.message }, { status: 400 });
  }

  const creatorIds = Array.from(
    new Set((sets ?? []).map((row) => String(row.user_id)).filter(Boolean)),
  );
  const { data: creatorProfiles, error: creatorError } =
    creatorIds.length > 0
      ? await admin
          .from("profiles")
          .select("id,display_name")
          .in("id", creatorIds)
      : { data: [], error: null as null | { message: string } };
  if (creatorError) {
    return NextResponse.json({ error: creatorError.message }, { status: 400 });
  }

  const creatorById = new Map(
    (creatorProfiles ?? []).map((profile) => [
      String(profile.id),
      {
        displayName:
          typeof profile.display_name === "string" && profile.display_name.trim()
            ? profile.display_name.trim()
            : null,
      },
    ]),
  );

  const byId = new Map((sets ?? []).map((row) => [String(row.id), row]));
  const rows = (links ?? [])
    .map((link) => {
      const meta = byId.get(String(link.set_id));
      if (!meta) return null;
      const creatorId = String(meta.user_id);
      const creator = creatorById.get(creatorId);
      const row: QuestionSetRow = {
        schoolId: String(link.school_id),
        setId: String(link.set_id),
        setName: String(meta.name),
        generatedAt: String(meta.generated_at),
        generationModelId: meta.generation_model_id
          ? String(meta.generation_model_id)
          : undefined,
        generationModelLabel: meta.generation_model_label
          ? String(meta.generation_model_label)
          : undefined,
        creatorUserId: creatorId,
        creatorName: creator?.displayName ?? `${creatorId.slice(0, 8)}...`,
        ownedByRequester: creatorId === requester.id,
      };
      return row;
    })
    .filter((row): row is QuestionSetRow => row !== null)
    .sort(
      (a, b) =>
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
    );

  return NextResponse.json({ rows });
}
