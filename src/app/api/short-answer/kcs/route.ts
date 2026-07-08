import { NextResponse } from "next/server";
import { getRequester } from "@/lib/assignments/manage-helpers";
import { STANDARD_DEFINITIONS } from "@/lib/standards";
import { getKCsByStandard } from "@/lib/short-answer/generation/data";

const STANDARD_IDS = new Set(STANDARD_DEFINITIONS.map((standard) => standard.id));

export async function GET(request: Request) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requester.role || !["teacher", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const standards = (url.searchParams.get("standards") ?? "")
    .split(",")
    .map((standard) => standard.trim())
    .filter((standard): standard is string => STANDARD_IDS.has(standard));

  const uniqueStandards = Array.from(new Set(standards));
  const kcs = uniqueStandards.flatMap((standard) =>
    getKCsByStandard(standard).map((kc) => ({
      code: kc.code,
      statement: kc.statement,
      standard: kc.standard,
    })),
  );

  return NextResponse.json({ kcs });
}
