import type { SvgDiagramData } from "@/types/question";
import { useMemo } from "react";

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

function sanitizeSvg(svg: string): string | null {
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

    return new XMLSerializer().serializeToString(root);
  } catch {
    return null;
  }
}

function toSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function SvgDiagram({ data }: SvgDiagramProps) {
  const safeSvgDataUrl = useMemo(() => {
    const sanitized = sanitizeSvg(data.svg);
    if (!sanitized) return null;
    return toSvgDataUrl(sanitized);
  }, [data.svg]);

  return (
    <div className="w-full bg-white p-4 border border-gray-300 rounded">
      {data.title && (
        <h3 className="text-center text-sm font-bold text-black mb-2">
          {data.title}
        </h3>
      )}
      <div className="flex justify-center items-center">
        {safeSvgDataUrl ? (
          <img
            src={safeSvgDataUrl}
            alt={data.title || "Biology diagram"}
            className="w-full sm:w-[50%] max-w-[460px] min-w-[140px] sm:min-w-[220px] h-auto block"
          />
        ) : (
          <div className="text-sm text-red-600">Unable to render diagram safely.</div>
        )}
      </div>
    </div>
  );
}
