import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";

// Event types we surface in the Feature Usage dashboard. All rows outside this
// set are ignored at the SQL layer so we do not pay to transfer attempt /
// session boundary events that are displayed elsewhere.
const FEATURE_EVENT_TYPES = [
  "glossary_term_opened",
  "tts_played",
  "confidence_submitted",
  "explanation_opened",
  "bookmark_added",
  "bookmark_removed",
  "hint_opened",
  "hint_closed",
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

function getNumber(payload: Record<string, unknown> | null, key: string): number | null {
  const value = payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const modeFilter = url.searchParams.get("mode");

  // Default to last 30 days if the caller omits the window.
  const to = toRaw ? new Date(toRaw) : new Date();
  const from = fromRaw
    ? new Date(fromRaw)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fromIso = from.toISOString();
  // `to` is treated as inclusive end-of-day when only a date was passed, so
  // we push it to the end of the day to match the "Student attempts" UX.
  const toDate = new Date(to);
  if (toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
    toDate.setHours(23, 59, 59, 999);
  }
  const toIso = toDate.toISOString();

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
  if (modeFilter && modeFilter !== "all") {
    query = query.eq("mode", modeFilter);
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const events = (rows ?? []) as EventRow[];
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

  // Explanation opened by phase
  const explanationByPhase: Record<string, Counter> = {};

  // Bookmark add vs remove
  const bookmarks = {
    added: emptyCounter(),
    removed: emptyCounter(),
  };

  // Hint dwell-time summary from `hint_closed` events
  let hintOpens = 0;
  let hintCloses = 0;
  const hintDwellMs: number[] = [];

  for (const event of events) {
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
      case "explanation_opened": {
        const phase = getString(payload, "phase") ?? "unknown";
        explanationByPhase[phase] ??= emptyCounter();
        bump(explanationByPhase[phase], user_id);
        break;
      }
      case "bookmark_added":
        bump(bookmarks.added, user_id);
        break;
      case "bookmark_removed":
        bump(bookmarks.removed, user_id);
        break;
      case "hint_opened":
        hintOpens += 1;
        break;
      case "hint_closed": {
        hintCloses += 1;
        const openMs = getNumber(payload, "openMs");
        if (openMs !== null && openMs >= 0 && openMs < 60 * 60 * 1000) {
          hintDwellMs.push(openMs);
        }
        break;
      }
    }
  }

  hintDwellMs.sort((a, b) => a - b);
  const dwellMedianMs =
    hintDwellMs.length > 0 ? hintDwellMs[Math.floor(hintDwellMs.length / 2)] : null;
  const dwellAvgMs =
    hintDwellMs.length > 0
      ? Math.round(
          hintDwellMs.reduce((sum, value) => sum + value, 0) / hintDwellMs.length,
        )
      : null;

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
      totalEvents: events.length,
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
    explanation: {
      byPhase: serializeRecord(explanationByPhase),
    },
    bookmarks: {
      added: serializeCounter(bookmarks.added),
      removed: serializeCounter(bookmarks.removed),
    },
    hints: {
      opens: hintOpens,
      closes: hintCloses,
      dwellAvgMs,
      dwellMedianMs,
      sampleSize: hintDwellMs.length,
    },
  });
}
