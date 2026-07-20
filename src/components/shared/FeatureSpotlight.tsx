"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";

const VIEWPORT_GUTTER = 8;
const SPOTLIGHT_PADDING = 6;
const SPOTLIGHT_RING_RADIUS = 16;
const SPOTLIGHT_CARD_GAP = 12;
const SPOTLIGHT_CARD_MAX_WIDTH = 420;
const SPOTLIGHT_ENTRY_FADE_MS = 220;
const SPOTLIGHT_INITIAL_TRACK_MS = 520;
const FLUSH_EDGE_EPSILON_PX = 2;

type CornerRadii = {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
};

type SpotlightRect = {
  targetId: string;
  top: number;
  left: number;
  width: number;
  height: number;
  radii: CornerRadii;
};

type SpotlightCardPosition = {
  top: number;
  left: number;
  width: number;
};

function toBorderRadius(radii: CornerRadii): string {
  return `${radii.topLeft}px ${radii.topRight}px ${radii.bottomRight}px ${radii.bottomLeft}px`;
}

function toRoundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radii: CornerRadii,
): string {
  const maxRadiusX = width / 2;
  const maxRadiusY = height / 2;
  const tl = Math.min(radii.topLeft, maxRadiusX, maxRadiusY);
  const tr = Math.min(radii.topRight, maxRadiusX, maxRadiusY);
  const br = Math.min(radii.bottomRight, maxRadiusX, maxRadiusY);
  const bl = Math.min(radii.bottomLeft, maxRadiusX, maxRadiusY);

  return [
    `M ${x + tl} ${y}`,
    `H ${x + width - tr}`,
    tr > 0 ? `A ${tr} ${tr} 0 0 1 ${x + width} ${y + tr}` : `L ${x + width} ${y}`,
    `V ${y + height - br}`,
    br > 0
      ? `A ${br} ${br} 0 0 1 ${x + width - br} ${y + height}`
      : `L ${x + width} ${y + height}`,
    `H ${x + bl}`,
    bl > 0 ? `A ${bl} ${bl} 0 0 1 ${x} ${y + height - bl}` : `L ${x} ${y + height}`,
    `V ${y + tl}`,
    tl > 0 ? `A ${tl} ${tl} 0 0 1 ${x + tl} ${y}` : `L ${x} ${y}`,
    "Z",
  ].join(" ");
}

function clampSpotlightRect(
  rect: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
): Omit<SpotlightRect, "targetId"> {
  // Edge-flush controls (e.g. the Notes tab) should keep padding only on open
  // sides, with square corners on the flush side — matching rounded-l / rounded-r tabs.
  const flushLeft = rect.left <= FLUSH_EDGE_EPSILON_PX;
  const flushTop = rect.top <= FLUSH_EDGE_EPSILON_PX;
  const flushRight = rect.right >= viewportWidth - FLUSH_EDGE_EPSILON_PX;
  const flushBottom = rect.bottom >= viewportHeight - FLUSH_EDGE_EPSILON_PX;

  const left = rect.left - (flushLeft ? 0 : SPOTLIGHT_PADDING);
  const top = rect.top - (flushTop ? 0 : SPOTLIGHT_PADDING);
  const right = rect.right + (flushRight ? 0 : SPOTLIGHT_PADDING);
  const bottom = rect.bottom + (flushBottom ? 0 : SPOTLIGHT_PADDING);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const radius = SPOTLIGHT_RING_RADIUS;

  return {
    top,
    left,
    width,
    height,
    radii: {
      topLeft: flushLeft || flushTop ? 0 : radius,
      topRight: flushRight || flushTop ? 0 : radius,
      bottomRight: flushRight || flushBottom ? 0 : radius,
      bottomLeft: flushLeft || flushBottom ? 0 : radius,
    },
  };
}

function toSpotlightRects(targetIds: string[]): SpotlightRect[] {
  if (typeof window === "undefined") return [];
  const rects: SpotlightRect[] = [];
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  for (const targetId of targetIds) {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-tour-id="${targetId}"]`),
    );
    const target = candidates.find((candidate) => {
      const candidateRect = candidate.getBoundingClientRect();
      const style = window.getComputedStyle(candidate);
      return (
        candidateRect.width > 0 &&
        candidateRect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    });

    if (!target) continue;

    const rect = target.getBoundingClientRect();
    rects.push({
      targetId,
      ...clampSpotlightRect(rect, viewportWidth, viewportHeight),
    });
  }

  return rects;
}

function toBoundingRect(rects: SpotlightRect[]): SpotlightRect | null {
  if (rects.length === 0) return null;
  const top = Math.min(...rects.map((rect) => rect.top));
  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  return {
    targetId: "__combined__",
    top,
    left,
    width: right - left,
    height: bottom - top,
    radii: {
      topLeft: SPOTLIGHT_RING_RADIUS,
      topRight: SPOTLIGHT_RING_RADIUS,
      bottomRight: SPOTLIGHT_RING_RADIUS,
      bottomLeft: SPOTLIGHT_RING_RADIUS,
    },
  };
}

function toCardPosition(
  rect: SpotlightRect,
  cardHeight: number,
): SpotlightCardPosition {
  const width = Math.min(
    SPOTLIGHT_CARD_MAX_WIDTH,
    window.innerWidth - VIEWPORT_GUTTER * 2,
  );
  const horizontalGap = SPOTLIGHT_CARD_GAP;
  const maxLeft = Math.max(
    VIEWPORT_GUTTER,
    window.innerWidth - width - VIEWPORT_GUTTER,
  );
  const availableRight =
    window.innerWidth - VIEWPORT_GUTTER - (rect.left + rect.width) - horizontalGap;
  const availableLeft = rect.left - VIEWPORT_GUTTER - horizontalGap;
  const canPlaceRight = availableRight >= width;
  const canPlaceLeft = availableLeft >= width;

  if (canPlaceRight || canPlaceLeft) {
    const placeRight = canPlaceRight && (!canPlaceLeft || availableRight >= availableLeft);
    const left = placeRight
      ? Math.min(maxLeft, rect.left + rect.width + horizontalGap)
      : Math.max(VIEWPORT_GUTTER, rect.left - width - horizontalGap);
    let top = rect.top + rect.height / 2 - cardHeight / 2;
    if (rect.height > cardHeight + SPOTLIGHT_CARD_GAP * 2) {
      top = rect.top + SPOTLIGHT_CARD_GAP;
    }
    const maxTop = Math.max(
      VIEWPORT_GUTTER,
      window.innerHeight - cardHeight - VIEWPORT_GUTTER,
    );
    return {
      top: Math.min(maxTop, Math.max(VIEWPORT_GUTTER, top)),
      left,
      width,
    };
  }

  const left = Math.min(maxLeft, Math.max(VIEWPORT_GUTTER, rect.left));

  const belowTop = rect.top + rect.height + SPOTLIGHT_CARD_GAP;
  const canPlaceBelow =
    belowTop + cardHeight <= window.innerHeight - VIEWPORT_GUTTER;
  const aboveTop = rect.top - cardHeight - SPOTLIGHT_CARD_GAP;
  const canPlaceAbove = aboveTop >= VIEWPORT_GUTTER;

  let top = belowTop;
  if (!canPlaceBelow && canPlaceAbove) {
    top = aboveTop;
  } else if (!canPlaceBelow && !canPlaceAbove) {
    const centeredTop = rect.top + rect.height / 2 - cardHeight / 2;
    const maxTop = Math.max(
      VIEWPORT_GUTTER,
      window.innerHeight - cardHeight - VIEWPORT_GUTTER,
    );
    top = Math.min(maxTop, Math.max(VIEWPORT_GUTTER, centeredTop));
  }

  return { top, left, width };
}

interface FeatureSpotlightProps {
  targetId?: string;
  targetIds?: string[];
  cardAnchorTargetId?: string;
  cardOffsetY?: number;
  showCard?: boolean;
  title: string;
  description: string;
  detail?: string;
  ctaLabel?: string;
  onClose: () => void;
}

export function FeatureSpotlight({
  targetId,
  targetIds,
  cardAnchorTargetId,
  cardOffsetY = 0,
  showCard = true,
  title,
  description,
  detail,
  ctaLabel = "Got it",
  onClose,
}: FeatureSpotlightProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [spotlightRects, setSpotlightRects] = useState<SpotlightRect[]>([]);
  const [cardPosition, setCardPosition] = useState<SpotlightCardPosition | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const rawMaskId = useId();
  const maskId = `feature-spotlight-mask-${rawMaskId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const targetIdsKey = (targetIds && targetIds.length > 0
    ? targetIds
    : targetId
      ? [targetId]
      : []
  ).join("||");
  const resolvedTargetIds = useMemo(
    () => (targetIdsKey ? targetIdsKey.split("||") : []),
    [targetIdsKey],
  );

  useEffect(() => {
    setIsVisible(false);
    const rafId = window.requestAnimationFrame(() => setIsVisible(true));
    return () => window.cancelAnimationFrame(rafId);
  }, [targetIdsKey]);

  useEffect(() => {
    const update = () => setSpotlightRects(toSpotlightRects(resolvedTargetIds));
    update();
    const startTs = performance.now();
    let rafId = 0;
    const tick = (now: number) => {
      update();
      if (now - startTs < SPOTLIGHT_INITIAL_TRACK_MS) {
        rafId = window.requestAnimationFrame(tick);
      }
    };
    rafId = window.requestAnimationFrame(tick);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [targetIdsKey, resolvedTargetIds]);

  useEffect(() => {
    const targetRect =
      (cardAnchorTargetId
        ? spotlightRects.find((rect) => rect.targetId === cardAnchorTargetId)
        : null) ?? toBoundingRect(spotlightRects);

    if (!targetRect) {
      setCardPosition(null);
      return;
    }

    const update = () => {
      const cardHeight = cardRef.current?.offsetHeight ?? 220;
      const position = toCardPosition(targetRect, cardHeight);
      if (cardOffsetY === 0) {
        setCardPosition(position);
        return;
      }
      const maxTop = Math.max(
        VIEWPORT_GUTTER,
        window.innerHeight - cardHeight - VIEWPORT_GUTTER,
      );
      setCardPosition({
        ...position,
        top: Math.min(maxTop, Math.max(VIEWPORT_GUTTER, position.top + cardOffsetY)),
      });
    };
    update();
    const rafId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(rafId);
  }, [cardAnchorTargetId, cardOffsetY, spotlightRects]);

  const cardStyle: CSSProperties | undefined = cardPosition
    ? {
        position: "fixed",
        top: cardPosition.top,
        left: cardPosition.left,
        width: cardPosition.width,
      }
    : {
        position: "fixed",
        left: VIEWPORT_GUTTER,
        right: VIEWPORT_GUTTER,
        bottom: VIEWPORT_GUTTER,
        maxWidth: SPOTLIGHT_CARD_MAX_WIDTH,
      };

  return (
    <div
      data-testid="feature-spotlight"
      className="fixed inset-0 z-[75] transition-opacity ease-out"
      style={{
        opacity: isVisible ? 1 : 0,
        transitionDuration: `${SPOTLIGHT_ENTRY_FADE_MS}ms`,
      }}
    >
      {spotlightRects.length > 0 ? (
        <svg
          className="fixed inset-0 h-full w-full"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <mask id={maskId}>
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {spotlightRects.map((rect, index) => (
                <path
                  key={`mask-${rect.targetId}-${rect.top}-${rect.left}-${rect.width}-${rect.height}-${index}`}
                  d={toRoundedRectPath(
                    rect.left,
                    rect.top,
                    rect.width,
                    rect.height,
                    rect.radii,
                  )}
                  fill="black"
                />
              ))}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(2, 6, 23, 0.68)"
            mask={`url(#${maskId})`}
          />
        </svg>
      ) : (
        <div className="fixed inset-0 bg-slate-950/70" />
      )}
      {spotlightRects.map((rect, index) => (
        <div
          key={`${rect.targetId}-${rect.top}-${rect.left}-${rect.width}-${rect.height}-${index}`}
          className="pointer-events-none fixed border-2 border-mint transition-[top,left,width,height,border-radius] duration-150 ease-out"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: toBorderRadius(rect.radii),
          }}
        />
      ))}

      {showCard ? (
        <div className="fixed inset-0">
          <div
            ref={cardRef}
            style={cardStyle}
            className="w-full rounded-2xl border border-primary/20 bg-surface shadow-2xl"
          >
            <div className="border-b border-border-subtle px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Feature tip
                  </p>
                  <h2 className="text-lg font-bold text-heading">{title}</h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Dismiss feature tip"
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
              {detail ? <p className="mt-1.5 text-sm text-muted-foreground">{detail}</p> : null}
            </div>
            <div className="flex justify-end px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                {ctaLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
