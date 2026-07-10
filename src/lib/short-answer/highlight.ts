export const HL_CLASS = "sa-hl";
export const HIGHLIGHT_ZONE_ATTR = "data-sa-highlight-zone";

const INTERACTIVE_TAGS = new Set([
  "BUTTON",
  "A",
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "LABEL",
]);

export interface TextSegment {
  node: Text;
  start: number;
  end: number;
}

export function unwrapHighlight(mark: HTMLElement): void {
  const parent = mark.parentNode;
  if (!parent) return;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
  parent.normalize();
}

export function isInsideTextarea(node: Node | null): boolean {
  let el: Node | null = node;
  while (el) {
    if (
      el.nodeType === Node.ELEMENT_NODE &&
      ((el as HTMLElement).tagName === "TEXTAREA" ||
        (el as HTMLElement).tagName === "INPUT")
    ) {
      return true;
    }
    el = el.parentNode;
  }
  return false;
}

export function isInsideInteractive(node: Node | null): boolean {
  let el: Node | null = node;
  while (el) {
    if (el.nodeType === Node.ELEMENT_NODE) {
      const tag = (el as HTMLElement).tagName;
      if (INTERACTIVE_TAGS.has(tag)) return true;
    }
    el = el.parentNode;
  }
  return false;
}

export function isInsideHighlightZone(node: Node | null): boolean {
  let el: Node | null = node;
  while (el) {
    if (el.nodeType === Node.ELEMENT_NODE) {
      if ((el as HTMLElement).hasAttribute(HIGHLIGHT_ZONE_ATTR)) return true;
    }
    el = el.parentNode;
  }
  return false;
}

export function isInsideExistingHighlight(node: Node | null): boolean {
  if (!node || node.nodeType !== Node.TEXT_NODE) return false;
  return Boolean(
    (node.parentElement as HTMLElement | null)?.closest(`mark.${HL_CLASS}`),
  );
}

/** Collect text-node slices intersecting a range, skipping controls and existing marks. */
export function collectTextSegments(
  range: Range,
  container: HTMLElement,
): TextSegment[] {
  const segments: TextSegment[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode() as Text | null;

  while (textNode) {
    if (!range.intersectsNode(textNode)) {
      textNode = walker.nextNode() as Text | null;
      continue;
    }
    if (
      isInsideTextarea(textNode) ||
      isInsideInteractive(textNode) ||
      isInsideExistingHighlight(textNode) ||
      !isInsideHighlightZone(textNode)
    ) {
      textNode = walker.nextNode() as Text | null;
      continue;
    }

    const start =
      textNode === range.startContainer ? range.startOffset : 0;
    const end =
      textNode === range.endContainer ? range.endOffset : textNode.data.length;
    if (start < end && textNode.data.slice(start, end).trim().length > 0) {
      segments.push({ node: textNode, start, end });
    }
    textNode = walker.nextNode() as Text | null;
  }

  return segments;
}

export function wrapTextSegment(segment: TextSegment): void {
  const { node, start, end } = segment;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);

  const mark = document.createElement("mark");
  mark.className = HL_CLASS;
  mark.title = "Click to remove highlight";

  try {
    range.surroundContents(mark);
  } catch {
    const contents = range.extractContents();
    mark.appendChild(contents);
    range.insertNode(mark);
  }
}

/** Apply one inline mark per text slice (reverse order keeps offsets stable). */
export function applyHighlights(segments: TextSegment[]): void {
  for (let i = segments.length - 1; i >= 0; i--) {
    wrapTextSegment(segments[i]);
  }
}

export function findHighlightFromEventTarget(
  target: EventTarget | null,
): HTMLElement | null {
  if (!target || !(target instanceof HTMLElement)) return null;
  const mark = target.closest(`mark.${HL_CLASS}`);
  return mark instanceof HTMLElement ? mark : null;
}
