import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Question } from "@/types/question";
import type { ShortAnswerItem } from "@/types/short-answer";
import sampleItem from "@/data/short-answer/sample-item.json";
import { QuestionEditModal } from "./QuestionEditModal";

vi.mock("@/lib/knowledge-components", () => ({
  fetchActiveKcsForStandard: vi.fn().mockResolvedValue([
    { code: "3.1.9-12.A1", standardId: "3.1.9-12.A", statement: "KC A1" },
  ]),
}));

const question: Question = {
  id: "question-a",
  module: 1,
  topic: "Genetics",
  standardId: "3.1.9-12.A",
  kcCode: "3.1.9-12.A1",
  text: "Which option is correct?",
  imageUrl: null,
  options: [
    { id: "A", text: "Option A" },
    { id: "B", text: "Option B" },
  ],
  correctOptionId: "A",
  source: "generated",
  includeInSelfPractice: true,
};

describe("QuestionEditModal KC assignment", () => {
  afterEach(() => cleanup());

  it("removes an unassigned MCQ from Self Practice when saved", async () => {
    const onSave = vi.fn();
    render(
      <QuestionEditModal question={question} onSave={onSave} onClose={vi.fn()} />,
    );

    const kcSelect = screen.getByLabelText("Knowledge Component");
    await waitFor(() => expect((kcSelect as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(kcSelect, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        kcCode: undefined,
        includeInSelfPractice: false,
      }),
    );
  });

  it("repairs legacy duplicate definitions before an SAQ is saved", () => {
    const item = structuredClone(sampleItem) as ShortAnswerItem;
    item.keyTerms = [
      { term: "prokaryotic", definition: "One KC statement reused for every term." },
      { term: "eukaryotic", definition: "One KC statement reused for every term." },
    ];
    const saq: Question = {
      ...question,
      id: "saq-legacy",
      text: item.parts[0].prompt,
      options: [],
      correctOptionId: "",
      questionType: "open-ended",
      shortAnswer: item,
    };
    const onSave = vi.fn();
    render(<QuestionEditModal question={saq} onSave={onSave} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        shortAnswer: expect.objectContaining({ keyTerms: [] }),
      }),
    );
  });

  it("does not save a newly invalid SAQ edit", async () => {
    const item = structuredClone(sampleItem) as ShortAnswerItem;
    const saq: Question = {
      ...question,
      id: "saq-current",
      text: item.parts[0].prompt,
      options: [],
      correctOptionId: "",
      questionType: "open-ended",
      shortAnswer: item,
    };
    const onSave = vi.fn();
    render(<QuestionEditModal question={saq} onSave={onSave} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Add term" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toContain(
        "Cannot save this short-answer item",
      );
    });
  });
});
