import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import KcCoveragePage from "./page";

describe("KC coverage page", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          rows: [
            {
              standardId: "3.1.9-12.A",
              questionCount: 10,
              selfPracticeCount: 8,
              validCount: 7,
              unresolvedCount: 1,
              coveredKcCount: 6,
              activeKcCount: 7,
              rolloutStatus: "disabled",
            },
          ],
        }),
      }),
    );
  });

  it("renders coverage status and keyboard-accessible views", async () => {
    render(<KcCoveragePage />);
    expect(await screen.findByText("3.1.9-12.A")).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "runs" }));
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith(
      "/api/admin/kc-coverage?view=runs&limit=100",
      { cache: "no-store" },
    ));
  });

  it("shows an English empty state", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ rows: [] }) } as Response);
    render(<KcCoveragePage />);
    expect(await screen.findByText("No records match this view.")).not.toBeNull();
  });
});
