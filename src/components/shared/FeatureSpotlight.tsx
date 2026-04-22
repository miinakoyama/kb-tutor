"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";

const VIEWPORT_GUTTER = 8;
const SPOTLIGHT_PADDING = 6;
const SPOTLIGHT_RING_RADIUS = 16;
const SPOTLIGHT_CARD_GAP = 12;
const SPOTLIGHT_CARD_MAX_WIDTH = 420;

type SpotlightRect = {
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
  const maxLeft = Math.max(
    VIEWPORT_GUTTER,
    window.innerWidth - width - VIEWPORT_GUTTER,
  );
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
  title: string;
  description: string;
  detail?: string;
  ctaLabel?: string;
  onClose: () => void;
}

export function FeatureSpotlight({
  targetId,
  targetIds,
  title,
  description,
  detail,
  ctaLabel = "Got it",
  onClose,
}: FeatureSpotlightProps) {
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
    const update = () => setSpotlightRects(toSpotlightRects(resolvedTargetIds));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [targetIdsKey, resolvedTargetIds]);

  useEffect(() => {
    const boundingRect = toBoundingRect(spotlightRects);
    if (!boundingRect) {
      setCardPosition(null);
      return;
    }

    const update = () => {
      const cardHeight = cardRef.current?.offsetHeight ?? 220;
      setCardPosition(toCardPosition(boundingRect, cardHeight));
    };
    update();
    const rafId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(rafId);
  }, [spotlightRects]);

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
    <div className="fixed inset-0 z-[75]">
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
                  key={`mask-${rect.top}-${rect.left}-${rect.width}-${rect.height}-${index}`}
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
          key={`${rect.top}-${rect.left}-${rect.width}-${rect.height}-${index}`}
          className="pointer-events-none fixed border-2 border-[#4ade80] transition-all duration-200"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: SPOTLIGHT_RING_RADIUS,
          }}
        />
      ))}

      <div className="fixed inset-0">
        <div
          ref={cardRef}
          style={cardStyle}
          className="w-full rounded-2xl border border-[#16a34a]/20 bg-white shadow-2xl"
        >
          <div className="border-b border-slate-100 px-6 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#16a34a]">
                  Feature tip
                </p>
                <h2 className="text-lg font-bold text-[#14532d]">{title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Dismiss feature tip"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600">{description}</p>
            {detail ? <p className="mt-1.5 text-sm text-slate-600">{detail}</p> : null}
          </div>
          <div className="flex justify-end px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#15803d]"
            >
              {ctaLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
