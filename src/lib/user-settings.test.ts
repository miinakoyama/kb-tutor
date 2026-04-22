import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_APP_TIME_ZONE } from "@/lib/timezone";
import { getStudentUserSettings } from "@/lib/user-settings";

function makeSupabase(responses: {
  timeZone?: { data: { time_zone?: unknown } | null; error?: unknown };
  notifRead?: {
    data: { notifications_last_read_at?: unknown } | null;
    error?: unknown;
  };
}): SupabaseClient {
  const from = vi.fn(() => {
    // Supabase `.select(column)` is what tells us which column was requested.
    const builder = {
      select: vi.fn((columns: string) => {
        const builderInner = {
          maybeSingle: vi.fn(async () => {
            if (columns.includes("time_zone")) {
              return responses.timeZone ?? { data: null, error: null };
            }
            if (columns.includes("notifications_last_read_at")) {
              return responses.notifRead ?? { data: null, error: null };
            }
            return { data: null, error: null };
          }),
        };
        return builderInner;
      }),
    };
    return builder;
  });
  return { from } as unknown as SupabaseClient;
}

describe("getStudentUserSettings", () => {
  it("returns defaults when both columns are missing", async () => {
    const supabase = makeSupabase({});
    const settings = await getStudentUserSettings(supabase);
    expect(settings).toEqual({
      timeZone: DEFAULT_APP_TIME_ZONE,
      notificationsLastReadAt: null,
    });
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

  it("returns the last-read timestamp when present", async () => {
    const supabase = makeSupabase({
      notifRead: {
        data: {
          notifications_last_read_at: "2026-04-18T09:00:00.000Z",
        },
        error: null,
      },
    });
    const settings = await getStudentUserSettings(supabase);
    expect(settings.notificationsLastReadAt).toBe("2026-04-18T09:00:00.000Z");
  });

  it("returns null when a query errors (no poisoning of the sibling value)", async () => {
    const supabase = makeSupabase({
      timeZone: { data: null, error: { message: "column missing" } },
      notifRead: {
        data: {
          notifications_last_read_at: "2026-04-18T09:00:00.000Z",
        },
        error: null,
      },
    });
    const settings = await getStudentUserSettings(supabase);
    expect(settings.timeZone).toBe(DEFAULT_APP_TIME_ZONE);
    expect(settings.notificationsLastReadAt).toBe("2026-04-18T09:00:00.000Z");
  });
});
