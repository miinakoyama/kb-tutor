import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeedbackBlock } from "./FeedbackBlock";

describe("FeedbackBlock", () => {
  it("shows a final model answer immediately in a clearly labeled section", () => {
    render(
      <FeedbackBlock
        feedback={{
          verdict: "heres_the_idea",
          segments: [{ label: "", text: "Review how genetic information is carried." }],
          modelAnswer: "mRNA carries the genetic code to the ribosome.",
        }}
        triesLeft={0}
      />,
    );

    expect(screen.getByText("Model answer")).toBeTruthy();
    expect(
      screen.getByText("mRNA carries the genetic code to the ribosome."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /model answer/i }),
    ).toBeNull();
  });
});
