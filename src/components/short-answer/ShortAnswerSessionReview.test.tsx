import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import sampleShortAnswerItem from "@/data/short-answer/sample-item.json";
import type { ShortAnswerItem } from "@/types/short-answer";
import {
  ShortAnswerSessionReview,
  buildShortAnswerPartReviews,
} from "./ShortAnswerSessionReview";

const item = sampleShortAnswerItem as ShortAnswerItem;

describe("ShortAnswerSessionReview", () => {
  it("shows every attempt with response and feedback", () => {
    const parts = buildShortAnswerPartReviews(item.parts, [
      {
        id: "a1",
        part_label: "A",
        attempt_number: 1,
        response_text: "DNA",
        feedback: {
          verdict: "good_try",
          segments: [{ label: "Try this", text: "Name the transcript." }],
        },
        is_correct: false,
        score: 0,
        max_score: item.parts[0].maxScore,
      },
      {
        id: "a2",
        part_label: "A",
        attempt_number: 2,
        response_text: "mRNA",
        feedback: {
          verdict: "correct",
          segments: [{ label: "What I noticed", text: "You named mRNA." }],
          modelAnswer: "mRNA carries the code to the ribosome.",
        },
        is_correct: true,
        score: item.parts[0].maxScore,
        max_score: item.parts[0].maxScore,
      },
    ]);

    render(<ShortAnswerSessionReview item={item} parts={parts} />);

    expect(screen.getByText(item.stem)).toBeTruthy();
    expect(screen.getByText(item.parts[0].prompt)).toBeTruthy();
    expect(screen.getByText("Attempt 1")).toBeTruthy();
    expect(screen.getByText("Attempt 2")).toBeTruthy();
    expect(screen.getByText(/“DNA”/)).toBeTruthy();
    expect(screen.getByText(/“mRNA”/)).toBeTruthy();
    expect(screen.getByText("Name the transcript.")).toBeTruthy();
    expect(screen.getByText("You named mRNA.")).toBeTruthy();
  });
});
