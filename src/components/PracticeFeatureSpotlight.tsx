"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

const VIEWPORT_GUTTER = 8;
const SPOTLIGHT_PADDING = 6;
const SPOTLIGHT_RING_RADIUS = 16;
const SPOTLIGHT_MODAL_GAP = 12;
const SPOTLIGHT_MODAL_MAX_WIDTH = 420;

export const PRACTICE_SPOTLIGHT_DATA_ATTR = "data-practice-spotlight";

export type PracticeSpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type ModalPosition = {
  top: number;
  left: number;
  width: number;
};

function aggregateSpotlightRect(spotlightIds: string[]): PracticeSpotlightRect | null {
  if (typeof window === "undefined" || spotlightIds.length === 0) return null;

  const aggregate = {
    top: Number.POSITIVE_INFINITY,
    left: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY,
    found: false,
  };

  for (const id of spotlightIds) {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(`[${PRACTICE_SPOTLIGHT_DATA_ATTR}="${id}"]`),
    );
    const visible = candidates.find((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    });
    if (!visible) continue;
    const rect = visible.getBoundingClientRect();
    aggregate.top = Math.min(aggregate.top, rect.top);
    aggregate.left = Math.min(aggregate.left, rect.left);
    aggregate.right = Math.max(aggregate.right, rect.right);
    aggregate.bottom = Math.max(aggregate.bottom, rect.bottom);
    aggregate.found = true;
  }

  if (!aggregate.found) return null;

  const top = Math.max(VIEWPORT_GUTTER, aggregate.top - SPOTLIGHT_PADDING);
  const left = Math.max(VIEWPORT_GUTTER, aggregate.left - SPOTLIGHT_PADDING);
  const right = Math.min(
    window.innerWidth - VIEWPORT_GUTTER,
    aggregate.right + SPOTLIGHT_PADDING,
  );
  const bottom = Math.min(
    window.innerHeight - VIEWPORT_GUTTER,
    aggregate.bottom + SPOTLIGHT_PADDING,
  );

  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function modalPositionForRect(rect: PracticeSpotlightRect, cardHeight: number): ModalPosition {
  const width = Math.min(
    SPOTLIGHT_MODAL_MAX_WIDTH,
    window.innerWidth - VIEWPORT_GUTTER * 2,
  );
  const maxLeft = Math.max(
    VIEWPORT_GUTTER,
    window.innerWidth - width - VIEWPORT_GUTTER,
  );
  const left = Math.min(maxLeft, Math.max(VIEWPORT_GUTTER, rect.left));

  const belowTop = rect.top + rect.height + SPOTLIGHT_MODAL_GAP;
  const canPlaceBelow = belowTop + cardHeight <= window.innerHeight - VIEWPORT_GUTTER;
  const aboveTop = rect.top - cardHeight - SPOTLIGHT_MODAL_GAP;
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

interface PracticeFeatureSpotlightProps {
  open: boolean;
  /** One or more spotlight ids; rectangle covers all visible matching elements. */
  spotlightIds: string[];
  title: string;
  description: string;
  dismissLabel?: string;
  onDismiss: () => void;
}

export function PracticeFeatureSpotlight({
  open,
  spotlightIds,
  title,
  description,
  dismissLabel = "Got it",
  onDismiss,
}: PracticeFeatureSpotlightProps) {
  const [rect, setRect] = useState<PracticeSpotlightRect | null>(null);
  const [modalPos, setModalPos] = useState<ModalPosition | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }

    const update = () => setRect(aggregateSpotlightRect(spotlightIds));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const t = window.setInterval(update, 400);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.clearInterval(t);
    };
  }, [open, spotlightIds]);

  useEffect(() => {
    if (!open || !rect) {
      setModalPos(null);
      return;
    }
    const update = () => {
      const cardHeight = cardRef.current?.offsetHeight ?? 200;
      setModalPos(modalPositionForRect(rect, cardHeight));
    };
    update();
    const raf = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(raf);
  }, [open, rect]);

  if (!open) return null;

  const cardStyle: CSSProperties | undefined = modalPos
    ? {
        position: "fixed",
        top: modalPos.top,
        left: modalPos.left,
        width: modalPos.width,
      }
    : {
        position: "fixed",
        left: VIEWPORT_GUTTER,
        right: VIEWPORT_GUTTER,
        bottom: VIEWPORT_GUTTER,
        maxWidth: SPOTLIGHT_MODAL_MAX_WIDTH,
      };

  return (
    <div
      className="fixed inset-0 z-[85] pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="practice-spotlight-title"
    >
      {rect ? (
        <div
          className="pointer-events-none fixed border-2 border-[#4ade80] transition-all duration-200"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: SPOTLIGHT_RING_RADIUS,
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.68)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-950/70" />
      )}

      <div className="fixed inset-0">
        <div
          ref={cardRef}
          style={cardStyle}
          className="w-full rounded-2xl border border-[#16a34a]/20 bg-white shadow-2xl"
        >
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#16a34a]">Tip</p>
            <h2 id="practice-spotlight-title" className="text-lg font-bold text-[#14532d]">
              {title}
            </h2>
            <p className="mt-2 text-sm text-slate-600">{description}</p>
          </div>
          <div className="flex justify-end px-5 py-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#15803d]"
            >
              {dismissLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
