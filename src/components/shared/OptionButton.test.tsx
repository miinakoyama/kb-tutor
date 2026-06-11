import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OptionButton } from "./OptionButton";

describe("OptionButton feedback icon sizing", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the compact feedback icon within the option's normal content height", () => {
    render(
      <OptionButton
        option={{ id: "A", text: "Option A", feedback: "Correct." }}
        isSelected
        showCorrect
        showWrong={false}
        isAnswered
        onSelect={vi.fn()}
        showFeedbackIcon
        compact
      />,
    );

    const icon = screen.getByRole("button", { name: "Why this is correct" });
    expect(icon.className).toContain("w-7");
    expect(icon.className).toContain("h-7");
    expect(icon.className).not.toContain("min-h-[44px]");
  });

  it("matches the regular option badge size outside compact layouts", () => {
    render(
      <OptionButton
        option={{ id: "A", text: "Option A", feedback: "Correct." }}
        isSelected
        showCorrect
        showWrong={false}
        isAnswered
        onSelect={vi.fn()}
        showFeedbackIcon
      />,
    );

    const icon = screen.getByRole("button", { name: "Why this is correct" });
    expect(icon.className).toContain("w-8");
    expect(icon.className).toContain("h-8");
  });
});
