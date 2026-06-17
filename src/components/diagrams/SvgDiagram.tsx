import type { SvgDiagramData } from "@/types/question";
import { useEffect, useState } from "react";

interface SvgDiagramProps {
  data: SvgDiagramData;
}

const FORBIDDEN_TAGS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "embed",
  "object",
  "audio",
  "video",
  "canvas",
]);

const SAFE_ATTR_PREFIXES = ["aria-", "data-"];
const SAFE_ATTR_NAMES = new Set([
  "xmlns",
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "transform",
  "text-anchor",
  "font-size",
  "font-weight",
  "font-family",
  "dominant-baseline",
  "preserveAspectRatio",
  "markerWidth",
  "markerHeight",
  "refX",
  "refY",
  "orient",
  "markerUnits",
  "id",
  "class",
]);

function sanitizeSvg(svg: string, options: { trimViewBox?: boolean } = {}): string | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== "svg") return null;

    const allElements = Array.from(root.querySelectorAll("*"));
    for (const el of allElements) {
      const tag = el.tagName.toLowerCase();
      if (FORBIDDEN_TAGS.has(tag)) {
        el.remove();
        continue;
      }

      for (const attr of Array.from(el.attributes)) {
        const name = attr.name;
        const lowerName = name.toLowerCase();
        const value = attr.value.toLowerCase();

        const isSafePrefixed = SAFE_ATTR_PREFIXES.some((prefix) =>
          lowerName.startsWith(prefix)
        );
        const isAllowed = SAFE_ATTR_NAMES.has(name) || isSafePrefixed;
        const isEventHandler = lowerName.startsWith("on");
        const isDangerousValue =
          value.includes("javascript:") ||
          value.includes("data:text/html") ||
          value.includes("<script");

        if (!isAllowed || isEventHandler || isDangerousValue) {
          el.removeAttribute(name);
        }
      }
    }

    // Remove inline style to avoid url(...) or script-like content.
    root.removeAttribute("style");
    root.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    if (options.trimViewBox) {
      trimViewBoxToContent(root);
    }

    return new XMLSerializer().serializeToString(root);
  } catch {
    return null;
  }
}

/**
 * Measures the actual rendered bounding box of the SVG and tightens its
 * viewBox to that rectangle (plus a small padding) so the diagram is not
 * surrounded by empty space.
 *
 * Requires a DOM environment and silently no-ops on failure.
 */
function trimViewBoxToContent(root: Element): void {
  if (typeof document === "undefined") return;

  const holder = document.createElement("div");
  holder.setAttribute(
    "style",
    [
      "position:absolute",
      "left:-99999px",
      "top:-99999px",
      "width:800px",
      "height:800px",
      "visibility:hidden",
      "pointer-events:none",
    ].join(";"),
  );

  const clone = root.cloneNode(true) as SVGSVGElement;
  // Force a stable render size so getBBox can measure text/markers reliably.
  clone.setAttribute("width", "800");
  clone.setAttribute("height", "800");

  try {
    holder.appendChild(clone);
    document.body.appendChild(holder);

    const bbox = (clone as unknown as SVGGraphicsElement).getBBox();
    if (
      Number.isFinite(bbox.width) &&
      Number.isFinite(bbox.height) &&
      bbox.width > 0 &&
      bbox.height > 0
    ) {
      const pad = Math.max(2, Math.min(bbox.width, bbox.height) * 0.02);
      const vbX = bbox.x - pad;
      const vbY = bbox.y - pad;
      const vbW = bbox.width + pad * 2;
      const vbH = bbox.height + pad * 2;
      root.setAttribute(
        "viewBox",
        `${round(vbX)} ${round(vbY)} ${round(vbW)} ${round(vbH)}`,
      );
      root.removeAttribute("width");
      root.removeAttribute("height");
      if (!root.getAttribute("preserveAspectRatio")) {
        root.setAttribute("preserveAspectRatio", "xMidYMid meet");
      }
    }
  } catch {
    // Ignore measurement failures; the original viewBox remains.
  } finally {
    if (holder.parentNode) holder.parentNode.removeChild(holder);
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function toSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    window.setTimeout(resolve, 0);
  });
}

export function SvgDiagram({ data }: SvgDiagramProps) {
  const [safeSvgDataUrl, setSafeSvgDataUrl] = useState<string | null>(null);
  const [isRenderReady, setIsRenderReady] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setSafeSvgDataUrl(null);
    setIsRenderReady(false);

    const prepareSvg = async () => {
      if (typeof document === "undefined") return;

      try {
        await document.fonts?.ready;
      } catch {
        // Continue with browser fallback fonts if font readiness is unavailable.
      }

      await waitForAnimationFrame();
      await waitForAnimationFrame();

      if (isCancelled) return;

      const sanitized = sanitizeSvg(data.svg, { trimViewBox: true });
      if (isCancelled) return;

      setSafeSvgDataUrl(sanitized ? toSvgDataUrl(sanitized) : null);
      setIsRenderReady(true);
    };

    void prepareSvg();

    return () => {
      isCancelled = true;
    };
  }, [data.svg]);

  return (
    <div className="w-full bg-surface p-4 border border-border-default rounded">
      {data.title && (
        <h3 className="text-center text-sm font-bold text-foreground mb-2">
          {data.title}
        </h3>
      )}
      <div className="flex justify-center items-center rounded-md bg-[var(--diagram-canvas)] p-3">
        <div className="flex h-[220px] w-full max-w-[520px] min-w-[140px] items-center justify-center sm:min-w-[260px]">
          {!isRenderReady ? (
            <div className="h-full w-full" aria-hidden="true" />
          ) : safeSvgDataUrl ? (
            // Using <img> instead of next/image because:
            // - safeSvgDataUrl is a data URL generated at runtime, not a static asset
            // - next/image doesn't support data URLs and requires static images for optimization
            // - Data URLs don't benefit from image optimization as they're inline content
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={safeSvgDataUrl}
              alt={data.title || "Biology diagram"}
              className="diagram-raster block h-full w-full object-contain"
            />
          ) : (
            <div className="text-sm text-error">Unable to render diagram safely.</div>
          )}
        </div>
      </div>
    </div>
  );
}
