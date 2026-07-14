import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SelfPracticePlanner } from "./SelfPracticePlanner";

describe("SelfPracticePlanner flow", () => {
  afterEach(() => {
    cleanup();
  });

  it("starts on the mode selection step with Next disabled until a mode is chosen", () => {
    render(<SelfPracticePlanner />);

    const nextButton = screen.getByRole("button", { name: "Next" });

    expect(screen.getByText("Select Mode")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Practice Get feedback as you go\./,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Exam Exam Simulation\. Practice under test-day rules\./,
      }),
    ).toBeTruthy();
    expect((nextButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(
      screen.getByRole("button", {
        name: /Practice Get feedback as you go\./,
      }),
    );

    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("advances to topic selection without showing mastery tags", () => {
    render(<SelfPracticePlanner />);

    fireEvent.click(
      screen.getByRole("button", {
        name: /Practice Get feedback as you go\./,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Choose Topics")).toBeTruthy();
    // Mastery tags are teacher-facing only and must not render for students.
    expect(screen.queryByText("Mastered")).toBeNull();
    expect(screen.queryByText("Proficient")).toBeNull();
    expect(screen.queryByText("Building up")).toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Start Practice" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
