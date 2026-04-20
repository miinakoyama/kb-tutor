"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface AdaptiveDiagramViewportProps {
  children: ReactNode;
  className?: string;
  maxHeightClassName?: string;
}

/**
 * Keeps a stable viewport size for diagrams while shrinking content when needed
 * so the full diagram remains visible without inner scrolling.
 */
export function AdaptiveDiagramViewport({
  children,
  className,
  maxHeightClassName = "max-h-[320px]",
}: AdaptiveDiagramViewportProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);

  useEffect(() => {
    const viewportEl = viewportRef.current;
    const contentEl = contentRef.current;
    if (!viewportEl || !contentEl) return;

    const recalculate = () => {
      const viewportWidth = viewportEl.clientWidth;
      const viewportHeight = viewportEl.clientHeight;
      const contentWidth = contentEl.scrollWidth;
      const contentHeight = contentEl.scrollHeight;

      if (viewportWidth <= 0 || viewportHeight <= 0 || contentWidth <= 0 || contentHeight <= 0) {
        setScale(1);
        setScaledHeight(null);
        return;
      }

      const nextScale = Math.min(
        1,
        viewportWidth / contentWidth,
        viewportHeight / contentHeight,
      );

      setScale(nextScale);
      setScaledHeight(contentHeight * nextScale);
    };

    const observer = new ResizeObserver(recalculate);
    observer.observe(viewportEl);
    observer.observe(contentEl);
    recalculate();

    return () => observer.disconnect();
  }, [children]);

  return (
    <div
      ref={viewportRef}
      className={`w-full overflow-hidden rounded-lg border border-slate-200 bg-white p-2 sm:p-3 ${maxHeightClassName} ${className ?? ""}`}
    >
      <div
        className="mx-auto"
        style={{
          width: "fit-content",
          height: scaledHeight ?? "auto",
        }}
      >
        <div
          ref={contentRef}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top center",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
