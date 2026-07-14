import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkForNewlyEarnedBadges,
  emitBadgesEarnedEvent,
  subscribeToBadgesEarned,
} from "@/lib/badges/celebration-events";

const BADGE = { id: "first_practice", name: "First Practice", icon: "badge_first-practice.png" };

describe("emitBadgesEarnedEvent / subscribeToBadgesEarned", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delivers emitted badges to subscribers", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToBadgesEarned(handler);

    emitBadgesEarnedEvent([BADGE]);

    expect(handler).toHaveBeenCalledWith([BADGE]);
    unsubscribe();
  });

  it("does not notify unsubscribed listeners", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToBadgesEarned(handler);
    unsubscribe();

    emitBadgesEarnedEvent([BADGE]);

    expect(handler).not.toHaveBeenCalled();
  });

  it("is a no-op for an empty badge list", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToBadgesEarned(handler);

    emitBadgesEarnedEvent([]);

    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe("checkForNewlyEarnedBadges", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits the badges returned by the sync endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ newlyEarned: [BADGE] }), { status: 200 })),
    );
    const handler = vi.fn();
    const unsubscribe = subscribeToBadgesEarned(handler);

    await checkForNewlyEarnedBadges();

    expect(handler).toHaveBeenCalledWith([BADGE]);
    unsubscribe();
  });

  it("does not emit when the endpoint returns no newly earned badges", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ newlyEarned: [] }), { status: 200 })),
    );
    const handler = vi.fn();
    const unsubscribe = subscribeToBadgesEarned(handler);

    await checkForNewlyEarnedBadges();

    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("swallows a failed request rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await expect(checkForNewlyEarnedBadges()).resolves.toBeUndefined();
  });

  it("swallows a non-ok response rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    const handler = vi.fn();
    const unsubscribe = subscribeToBadgesEarned(handler);

    await checkForNewlyEarnedBadges();

    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });
});
