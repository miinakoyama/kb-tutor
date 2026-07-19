import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TeacherAttemptFeedback } from "./TeacherAttemptFeedback";

describe("TeacherAttemptFeedback", () => {
  it("shows saved model-answer-only feedback", () => {
    render(
      <TeacherAttemptFeedback
        feedback={{
          verdict: "heres_the_idea",
          segments: [],
          modelAnswer: "The stored canonical answer.",
        }}
      />,
    );

    expect(screen.getByText("Model answer")).toBeTruthy();
    expect(screen.getByText("The stored canonical answer.")).toBeTruthy();
  });

  it("shows both closure feedback and the model answer", () => {
    render(
      <TeacherAttemptFeedback
        feedback={{
          verdict: "heres_the_idea",
          segments: [{ label: "Feedback", text: "The response names DNA." }],
          modelAnswer: "mRNA carries the code.",
        }}
      />,
    );

    expect(screen.getByText("The response names DNA.")).toBeTruthy();
    expect(screen.getByText("mRNA carries the code.")).toBeTruthy();
  });
});
