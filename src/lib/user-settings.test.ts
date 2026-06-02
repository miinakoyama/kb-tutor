import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_APP_TIME_ZONE } from "@/lib/timezone";
import { getStudentUserSettings } from "@/lib/user-settings";

function makeSupabase(responses: {
  timeZone?: { data: { time_zone?: unknown } | null; error?: unknown };
}): SupabaseClient {
  const from = vi.fn(() => {
    const builder = {
      select: vi.fn(() => ({
        maybeSingle: vi.fn(async () =>
          responses.timeZone ?? { data: null, error: null },
        ),
      })),
    };
    return builder;
  });
  return { from } as unknown as SupabaseClient;
}

describe("getStudentUserSettings", () => {
  it("returns default time zone when column is missing", async () => {
    const supabase = makeSupabase({});
    const settings = await getStudentUserSettings(supabase);
    expect(settings).toEqual({ timeZone: DEFAULT_APP_TIME_ZONE });
  });

  it("returns the stored time zone when valid", async () => {
    const supabase = makeSupabase({
      timeZone: { data: { time_zone: "Asia/Tokyo" }, error: null },
    });
    const settings = await getStudentUserSettings(supabase);
    expect(settings.timeZone).toBe("Asia/Tokyo");
  });

  it("falls back to the default when the stored time zone is invalid", async () => {
    const supabase = makeSupabase({
      timeZone: { data: { time_zone: "Not/A_Zone" }, error: null },
    });
    const settings = await getStudentUserSettings(supabase);
    expect(settings.timeZone).toBe(DEFAULT_APP_TIME_ZONE);
  });
});
