import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  HL_CLASS,
  applyHighlights,
  collectTextSegments,
  findHighlightFromEventTarget,
  unwrapHighlight,
} from "./highlight";

describe("short-answer highlight utilities", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("wraps each text node separately instead of one block-level mark", () => {
    container.innerHTML = `
      <div data-sa-highlight-zone>
        <p id="a">First paragraph with text.</p>
        <p id="b">Second paragraph here.</p>
      </div>
    `;
    const range = document.createRange();
    range.setStart(container.querySelector("#a")!.firstChild!, 0);
    range.setEnd(container.querySelector("#b")!.firstChild!, 18);

    const segments = collectTextSegments(range, container);
    expect(segments.length).toBe(2);
    applyHighlights(segments);

    const marks = container.querySelectorAll(`mark.${HL_CLASS}`);
    expect(marks.length).toBe(2);
    marks.forEach((mark) => {
      expect(mark.querySelector("p")).toBeNull();
    });
  });

  it("skips text outside highlight zones", () => {
    container.innerHTML = `
      <div data-sa-highlight-zone>
        <p>Highlightable text.</p>
      </div>
      <p>Not highlightable.</p>
    `;
    const range = document.createRange();
    range.selectNodeContents(container);
    const segments = collectTextSegments(range, container);
    expect(segments.map((s) => s.node.textContent)).toEqual(["Highlightable text."]);
  });

  it("skips text inside buttons and existing highlights", () => {
    container.innerHTML = `
      <div data-sa-highlight-zone>
      <p>Visible text.</p>
      <button type="button">Do not highlight</button>
      <p>More <mark class="${HL_CLASS}">saved</mark> text.</p>
      </div>
    `;
    const range = document.createRange();
    range.selectNodeContents(container);

    const segments = collectTextSegments(range, container);
    expect(segments.map((s) => s.node.textContent)).toEqual([
      "Visible text.",
      "More ",
      " text.",
    ]);
    expect(segments.some((s) => s.node.textContent?.includes("saved"))).toBe(
      false,
    );
  });

  it("unwraps a highlight and finds marks via closest()", () => {
    container.innerHTML = `<p>Hello <mark class="${HL_CLASS}"><strong>world</strong></mark>!</p>`;
    const mark = container.querySelector(`mark.${HL_CLASS}`) as HTMLElement;
    const innerStrong = mark.querySelector("strong")!;

    expect(findHighlightFromEventTarget(innerStrong)).toBe(mark);
    unwrapHighlight(mark);
    expect(container.textContent).toBe("Hello world!");
    expect(container.querySelector(`mark.${HL_CLASS}`)).toBeNull();
  });
});
