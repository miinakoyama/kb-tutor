import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeedbackBlock } from "./FeedbackBlock";

describe("FeedbackBlock", () => {
  it("shows final feedback and a clearly labeled model answer", () => {
    render(
      <FeedbackBlock
        feedback={{
          verdict: "heres_the_idea",
          segments: [{ label: "Feedback", text: "Reconsider which molecule leaves the nucleus." }],
          modelAnswer: "mRNA carries the genetic code to the ribosome.",
        }}
        triesLeft={0}
      />,
    );

    expect(
      screen.getByText(/mRNA carries the genetic code to the ribosome\./),
    ).toBeTruthy();
    expect(screen.getByText("Reconsider which molecule leaves the nucleus.")).toBeTruthy();
    expect(screen.getByText("Model answer")).toBeTruthy();
    expect(screen.getAllByText("Feedback")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /model answer/i }),
    ).toBeNull();
  });
});
