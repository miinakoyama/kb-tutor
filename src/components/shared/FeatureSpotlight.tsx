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

type SpotlightRect = {
  targetId: string;
  top: number;
  left: number;
  width: number;
  height: number;
};

type SpotlightCardPosition = {
  top: number;
  left: number;
  width: number;
};

function toSpotlightRects(targetIds: string[]): SpotlightRect[] {
  if (typeof window === "undefined") return [];
  const rects: SpotlightRect[] = [];

  for (const targetId of targetIds) {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-tour-id="${targetId}"]`),
    );
    const target = candidates.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const style = window.getComputedStyle(candidate);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    });

    if (!target) continue;

    const rect = target.getBoundingClientRect();
    const top = Math.max(VIEWPORT_GUTTER, rect.top - SPOTLIGHT_PADDING);
    const left = Math.max(VIEWPORT_GUTTER, rect.left - SPOTLIGHT_PADDING);
    const right = Math.min(
      window.innerWidth - VIEWPORT_GUTTER,
      rect.right + SPOTLIGHT_PADDING,
    );
    const bottom = Math.min(
      window.innerHeight - VIEWPORT_GUTTER,
      rect.bottom + SPOTLIGHT_PADDING,
    );

    rects.push({
      targetId,
      top,
      left,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
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
                <rect
                  key={`mask-${rect.targetId}-${rect.top}-${rect.left}-${rect.width}-${rect.height}-${index}`}
                  x={rect.left}
                  y={rect.top}
                  width={rect.width}
                  height={rect.height}
                  rx={SPOTLIGHT_RING_RADIUS}
                  ry={SPOTLIGHT_RING_RADIUS}
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
          className="pointer-events-none fixed border-2 border-mint transition-[top,left,width,height] duration-150 ease-out"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: SPOTLIGHT_RING_RADIUS,
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
