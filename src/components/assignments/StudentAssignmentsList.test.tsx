import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StudentAssignmentsList } from "./StudentAssignmentsList";

describe("StudentAssignmentsList", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the calendar visible when there are no dated assignments", () => {
    render(<StudentAssignmentsList assignments={[]} loadError={null} />);

    expect(screen.getByRole("button", { name: "Previous month" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next month" })).toBeTruthy();
    expect(screen.getByText("No to-dos in this range.")).toBeTruthy();
    expect(
      screen.getByText("No completed assignments in this range."),
    ).toBeTruthy();
  });
});
