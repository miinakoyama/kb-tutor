"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import {
  applyHighlights,
  collectTextSegments,
  findHighlightFromEventTarget,
  unwrapHighlight,
} from "@/lib/short-answer/highlight";

interface HighlightLayerProps {
  /** Container whose text is highlightable. */
  containerRef: RefObject<HTMLElement | null>;
  /** Highlighting only active in practice/review, never exam. */
  enabled?: boolean;
}

/**
 * Always-on, selection-based highlighting (FR-010). Wraps each selected text
 * slice in inline <mark> nodes on mouseup; clicking an existing highlight
 * removes it. Selections inside textareas/inputs are ignored.
 */
export function HighlightLayer({ containerRef, enabled = true }: HighlightLayerProps) {
  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const onMouseUp = (event: MouseEvent) => {
      if (findHighlightFromEventTarget(event.target)) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        return;
      }

      const segments = collectTextSegments(range, container);
      if (segments.length === 0) return;

      applyHighlights(segments);
      selection.removeAllRanges();
    };

    const onClick = (event: MouseEvent) => {
      const mark = findHighlightFromEventTarget(event.target);
      if (!mark) return;
      event.preventDefault();
      unwrapHighlight(mark);
      window.getSelection()?.removeAllRanges();
    };

    container.addEventListener("mouseup", onMouseUp);
    container.addEventListener("click", onClick);
    return () => {
      container.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("click", onClick);
    };
  }, [containerRef, enabled]);

  return null;
}
