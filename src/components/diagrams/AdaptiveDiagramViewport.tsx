"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface AdaptiveDiagramViewportProps {
  children: ReactNode;
  className?: string;
  maxHeightClassName?: string;
}

// NOTE: the viewport is intentionally style-less (no border / background /
// padding) because every `DiagramRenderer` child already renders its own
// bordered card. Wrapping them in a second border produced a nested frame.

const SCALE_EPSILON = 0.005;
const HEIGHT_EPSILON = 0.5;

/**
 * Keeps a stable viewport size for diagrams while shrinking content when needed
 * so the full diagram remains visible without inner scrolling.
 *
 * The inner content wrapper uses `w-full` (not `fit-content`) so that
 * intrinsically responsive children such as Recharts' `ResponsiveContainer`
 * are given a real width to measure against.
 */
export function AdaptiveDiagramViewport({
  children,
  className,
  maxHeightClassName = "max-h-[380px]",
}: AdaptiveDiagramViewportProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);

  useEffect(() => {
    const viewportEl = viewportRef.current;
    const contentEl = contentRef.current;
    if (!viewportEl || !contentEl) return;

    let currentScale = 1;
    let currentScaledHeight: number | null = null;
    let rafId: number | null = null;

    const getContentBoxSize = (el: HTMLElement) => {
      const styles = window.getComputedStyle(el);
      const padX =
        (parseFloat(styles.paddingLeft) || 0) +
        (parseFloat(styles.paddingRight) || 0);
      const padY =
        (parseFloat(styles.paddingTop) || 0) +
        (parseFloat(styles.paddingBottom) || 0);
      return {
        width: Math.max(0, el.clientWidth - padX),
        height: Math.max(0, el.clientHeight - padY),
      };
    };

    const recalculate = () => {
      rafId = null;
      const { width: viewportWidth, height: viewportHeight } =
        getContentBoxSize(viewportEl);
      const contentWidth = contentEl.scrollWidth;
      const contentHeight = contentEl.scrollHeight;

      let nextScale = 1;
      let nextScaledHeight: number | null = null;

      if (
        viewportWidth > 0 &&
        viewportHeight > 0 &&
        contentWidth > 0 &&
        contentHeight > 0
      ) {
        nextScale = Math.min(
          1,
          viewportWidth / contentWidth,
          viewportHeight / contentHeight,
        );
        nextScaledHeight = contentHeight * nextScale;
      }

      if (Math.abs(nextScale - currentScale) > SCALE_EPSILON) {
        currentScale = nextScale;
        setScale(nextScale);
      }

      const heightChanged =
        nextScaledHeight === null
          ? currentScaledHeight !== null
          : currentScaledHeight === null ||
            Math.abs(nextScaledHeight - currentScaledHeight) > HEIGHT_EPSILON;

      if (heightChanged) {
        currentScaledHeight = nextScaledHeight;
        setScaledHeight(nextScaledHeight);
      }
    };

    // Coalesce observer callbacks into a single rAF so rapid consecutive
    // mutations (e.g. chart mount → child resize) don't cause re-render storms.
    const schedule = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(recalculate);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(viewportEl);
    observer.observe(contentEl);
    recalculate();

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={viewportRef}
      className={`w-full overflow-hidden ${maxHeightClassName} ${className ?? ""}`}
    >
      <div
        className="w-full"
        style={{
          height: scaledHeight ?? "auto",
        }}
      >
        <div
          ref={contentRef}
          className="w-full"
          style={{
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: "top center",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
