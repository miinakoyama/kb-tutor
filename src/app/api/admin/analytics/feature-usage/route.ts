import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import {
  parseAnalyticsWindow,
  parseSchoolIds,
} from "@/lib/analytics/admin-filters";

// Event types we surface in the Feature Usage dashboard. All rows outside this
// set are ignored at the SQL layer so we do not pay to transfer attempt /
// session boundary events that are displayed elsewhere.
const FEATURE_EVENT_TYPES = [
  "glossary_term_opened",
  "tts_played",
  "confidence_submitted",
  "bookmark_added",
  "bookmark_removed",
] as const;

type FeatureEventType = (typeof FEATURE_EVENT_TYPES)[number];

// Matches the row shape we request from `public.analytics_events`. `payload`
// is `jsonb` in Postgres — we type it as `Record<string, unknown>` and narrow
// per-event below.
type EventRow = {
  event_type: FeatureEventType;
  user_id: string;
  question_id: string | null;
  mode: string | null;
  occurred_at: string;
  payload: Record<string, unknown> | null;
};

type Counter = { n: number; users: Set<string> };

function bump(counter: Counter, userId: string) {
  counter.n += 1;
  counter.users.add(userId);
}

function emptyCounter(): Counter {
  return { n: 0, users: new Set<string>() };
}

function serializeCounter(c: Counter) {
  return { n: c.n, uniqueUsers: c.users.size };
}

function getString(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];
  return typeof value === "string" ? value : null;
}

function getBoolean(payload: Record<string, unknown> | null, key: string): boolean | null {
  const value = payload?.[key];
  return typeof value === "boolean" ? value : null;
}

async function requireAdmin() {
  const requester = await createSupabaseServerClient();
  const {
    data: { user },
  } = await requester.auth.getUser();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const { data: profile } = await requester
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, profile?.role);
  if (role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, userId: user.id };
}

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const { from, to } = parseAnalyticsWindow(url, { defaultDays: 30 });
  const schoolIds = parseSchoolIds(url);
  const modeFilter = url.searchParams.get("mode");
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const admin = createSupabaseAdminClient();

  // Defensive cap — if a school has unusually high traffic this protects the
  // function from OOM. 50k events covers ~8 concurrent classes for a month.
  const MAX_ROWS = 50_000;

  let query = admin
    .from("analytics_events")
    .select("event_type,user_id,question_id,mode,occurred_at,payload")
    .in("event_type", FEATURE_EVENT_TYPES as unknown as string[])
    .gte("occurred_at", fromIso)
    .lte("occurred_at", toIso)
    .order("occurred_at", { ascending: false })
    .limit(MAX_ROWS);
  if (schoolIds.length > 0) {
    query = query.in("school_id", schoolIds);
  }
  if (modeFilter && modeFilter !== "all") {
    query = query.eq("mode", modeFilter);
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const events = (rows ?? []) as EventRow[];
  const uniqueUserIds = Array.from(new Set(events.map((event) => String(event.user_id))));
  const excludedUserIds = new Set<string>();
  if (uniqueUserIds.length > 0) {
    const { data: excludedRows, error: excludedError } = await admin
      .from("profiles")
      .select("id")
      .in("id", uniqueUserIds)
      .eq("excluded_from_analytics", true);
    if (excludedError) {
      return NextResponse.json({ error: excludedError.message }, { status: 400 });
    }
    for (const row of excludedRows ?? []) {
      excludedUserIds.add(String(row.id));
    }
  }

  const filteredEvents = events.filter((event) => !excludedUserIds.has(String(event.user_id)));
  const wasTruncated = events.length >= MAX_ROWS;

  // --- Aggregators --------------------------------------------------------
  // Glossary opens by source
  const glossaryBySource: Record<string, Counter> = {};
  // Top 10 most-opened glossary terms (inline + modal + sidebar combined)
  const glossaryByTerm = new Map<string, { label: string; counter: Counter }>();

  // TTS plays by target
  const ttsByTarget: Record<string, Counter> = {};

  // Confidence × correctness matrix
  const confidenceMatrix: Record<string, Record<string, Counter>> = {};

  // Bookmark add vs remove
  const bookmarks = {
    added: emptyCounter(),
    removed: emptyCounter(),
  };

  for (const event of filteredEvents) {
    const { event_type, user_id, payload } = event;
    switch (event_type) {
      case "glossary_term_opened": {
        const source = getString(payload, "source") ?? "unknown";
        glossaryBySource[source] ??= emptyCounter();
        bump(glossaryBySource[source], user_id);
        const termId = getString(payload, "termId");
        const termLabel = getString(payload, "termLabel");
        if (termId) {
          const existing = glossaryByTerm.get(termId) ?? {
            label: termLabel ?? termId,
            counter: emptyCounter(),
          };
          bump(existing.counter, user_id);
          glossaryByTerm.set(termId, existing);
        }
        break;
      }
      case "tts_played": {
        const target = getString(payload, "target") ?? "unknown";
        ttsByTarget[target] ??= emptyCounter();
        bump(ttsByTarget[target], user_id);
        break;
      }
      case "confidence_submitted": {
        const level = getString(payload, "confidenceLevel") ?? "unknown";
        const isCorrect = getBoolean(payload, "isCorrect");
        const correctKey =
          isCorrect === null ? "unknown" : isCorrect ? "correct" : "incorrect";
        confidenceMatrix[level] ??= {};
        confidenceMatrix[level][correctKey] ??= emptyCounter();
        bump(confidenceMatrix[level][correctKey], user_id);
        break;
      }
      case "bookmark_added":
        bump(bookmarks.added, user_id);
        break;
      case "bookmark_removed":
        bump(bookmarks.removed, user_id);
        break;
    }
  }

  // Top N glossary terms
  const glossaryTopTerms = Array.from(glossaryByTerm.entries())
    .map(([termId, entry]) => ({
      termId,
      label: entry.label,
      ...serializeCounter(entry.counter),
    }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);

  const serializeRecord = (record: Record<string, Counter>) =>
    Object.fromEntries(
      Object.entries(record).map(([key, counter]) => [key, serializeCounter(counter)]),
    );

  const serializeMatrix = (matrix: Record<string, Record<string, Counter>>) =>
    Object.fromEntries(
      Object.entries(matrix).map(([level, inner]) => [level, serializeRecord(inner)]),
    );

  return NextResponse.json({
    meta: {
      from: fromIso,
      to: toIso,
      mode: modeFilter ?? "all",
      totalEvents: filteredEvents.length,
      truncated: wasTruncated,
    },
    glossary: {
      bySource: serializeRecord(glossaryBySource),
      topTerms: glossaryTopTerms,
    },
    tts: {
      byTarget: serializeRecord(ttsByTarget),
    },
    confidence: {
      matrix: serializeMatrix(confidenceMatrix),
    },
    bookmarks: {
      added: serializeCounter(bookmarks.added),
      removed: serializeCounter(bookmarks.removed),
    },
  });
}
