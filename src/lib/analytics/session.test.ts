import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

// The module under test issues `fetch` and reads `sessionStorage`. We mock
// `fetch` per test and use the jsdom-provided `sessionStorage`.
import {
  getCurrentAnalyticsSessionId,
  useAnalyticsSession,
} from "./session";

type FetchCall = { url: string; init?: RequestInit };

function mockFetchSequence(responses: Array<Partial<Response> | Error>) {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (url: unknown, init?: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit | undefined });
    const next = responses.shift();
    if (!next) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (next instanceof Error) throw next;
    return new Response(
      next.body ? String(next.body) : JSON.stringify({ ok: true }),
      { status: next.status ?? 200 },
    );
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  if (!init?.body) return {};
  try {
    return JSON.parse(String(init.body));
  } catch {
    return {};
  }
}

beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useAnalyticsSession", () => {
  it("creates a session row and emits session_started + stage_started on mount", async () => {
    const { calls } = mockFetchSequence([
      // POST /api/analytics/sessions
      {
        status: 200,
        body: JSON.stringify({ id: "sess-1", startedAt: "2026-04-21T00:00:00Z" }),
      },
    ]);

    const { result } = renderHook(() =>
      useAnalyticsSession({ mode: "practice" }),
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.sessionId).toBe("sess-1");
    expect(getCurrentAnalyticsSessionId()).toBe("sess-1");

    const creation = calls.find((c) => c.url === "/api/analytics/sessions");
    expect(creation).toBeDefined();
    expect(parseBody(creation?.init)).toMatchObject({ mode: "practice" });

    const startedEvents = calls.filter((c) => c.url === "/api/analytics/events");
    const eventTypes = startedEvents.map((c) => parseBody(c.init).eventType);
    expect(eventTypes).toContain("session_started");
    expect(eventTypes).toContain("stage_started");
  });

  it("emits stage_abandoned + session_ended on unmount when stage is not marked complete", async () => {
    const { calls } = mockFetchSequence([
      {
        status: 200,
        body: JSON.stringify({ id: "sess-abandon", startedAt: "2026-04-21T00:00:00Z" }),
      },
    ]);

    const { unmount } = renderHook(() =>
      useAnalyticsSession({ mode: "practice" }),
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Clear creation-time events so the test assertions focus on unmount.
    calls.length = 0;

    unmount();

    const events = calls
      .filter((c) => c.url === "/api/analytics/events")
      .map((c) => parseBody(c.init).eventType);
    expect(events).toContain("stage_abandoned");
    expect(events).toContain("session_ended");

    const patch = calls.find((c) =>
      c.url.startsWith("/api/analytics/sessions/sess-abandon"),
    );
    expect(patch).toBeDefined();
    expect(patch?.init?.method).toBe("PATCH");
  });

  it("does NOT emit stage_abandoned when markStageCompleted was called", async () => {
    const { calls } = mockFetchSequence([
      {
        status: 200,
        body: JSON.stringify({ id: "sess-complete", startedAt: "2026-04-21T00:00:00Z" }),
      },
    ]);

    const { result, unmount } = renderHook(() =>
      useAnalyticsSession({ mode: "practice" }),
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.markStageCompleted();
    });

    calls.length = 0;
    unmount();

    const events = calls
      .filter((c) => c.url === "/api/analytics/events")
      .map((c) => parseBody(c.init).eventType);
    expect(events).not.toContain("stage_abandoned");
    expect(events).toContain("session_ended");
  });

  it("fires stage_abandoned after 60s of hidden visibility", async () => {
    const { calls } = mockFetchSequence([
      {
        status: 200,
        body: JSON.stringify({ id: "sess-hidden", startedAt: "2026-04-21T00:00:00Z" }),
      },
    ]);

    renderHook(() => useAnalyticsSession({ mode: "practice" }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    calls.length = 0;

    // Simulate the tab going hidden.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Less than 60s should NOT fire anything yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    const earlyEvents = calls
      .filter((c) => c.url === "/api/analytics/events")
      .map((c) => parseBody(c.init).eventType);
    expect(earlyEvents).not.toContain("stage_abandoned");

    // Past 60s hidden: stage_abandoned fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    const lateEvents = calls
      .filter((c) => c.url === "/api/analytics/events")
      .map((c) => parseBody(c.init).eventType);
    expect(lateEvents).toContain("stage_abandoned");
    expect(lateEvents).toContain("session_ended");
  });
});
