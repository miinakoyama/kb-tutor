import { describe, it, expect, beforeEach } from "vitest";
import {
  getAnswerHistory,
  saveAnswer,
  getBookmarkedIds,
  addBookmark,
  removeBookmark,
  isBookmarked,
  toggleBookmark,
  getIncorrectQuestionIds,
  clearHistory,
} from "./storage";
import type { StoredAnswer } from "./storage";

function makeAnswer(overrides: Partial<StoredAnswer> = {}): StoredAnswer {
  return {
    questionId: "q1",
    selectedOptionId: "A",
    isCorrect: true,
    timestamp: Date.now(),
    mode: "practice",
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("answer history", () => {
  it("returns empty array when no history exists", () => {
    expect(getAnswerHistory()).toEqual([]);
  });

  it("saves and retrieves an answer", () => {
    const answer = makeAnswer();
    saveAnswer(answer);
    expect(getAnswerHistory()).toHaveLength(1);
    expect(getAnswerHistory()[0].questionId).toBe("q1");
  });

  it("appends multiple answers", () => {
    saveAnswer(makeAnswer({ questionId: "q1" }));
    saveAnswer(makeAnswer({ questionId: "q2" }));
    expect(getAnswerHistory()).toHaveLength(2);
  });
});

describe("bookmarks", () => {
  it("returns empty array when no bookmarks exist", () => {
    expect(getBookmarkedIds()).toEqual([]);
  });

  it("adds a bookmark", () => {
    addBookmark("q1");
    expect(getBookmarkedIds()).toContain("q1");
  });

  it("does not add duplicate bookmarks", () => {
    addBookmark("q1");
    addBookmark("q1");
    expect(getBookmarkedIds()).toHaveLength(1);
  });

  it("removes a bookmark", () => {
    addBookmark("q1");
    removeBookmark("q1");
    expect(getBookmarkedIds()).not.toContain("q1");
  });

  it("isBookmarked returns true for bookmarked id", () => {
    addBookmark("q1");
    expect(isBookmarked("q1")).toBe(true);
  });

  it("isBookmarked returns false for non-bookmarked id", () => {
    expect(isBookmarked("q1")).toBe(false);
  });

  it("toggleBookmark adds when not bookmarked and returns true", () => {
    const result = toggleBookmark("q1");
    expect(result).toBe(true);
    expect(isBookmarked("q1")).toBe(true);
  });

  it("toggleBookmark removes when already bookmarked and returns false", () => {
    addBookmark("q1");
    const result = toggleBookmark("q1");
    expect(result).toBe(false);
    expect(isBookmarked("q1")).toBe(false);
  });
});

describe("getIncorrectQuestionIds", () => {
  it("returns empty array when no history", () => {
    expect(getIncorrectQuestionIds()).toEqual([]);
  });

  it("returns ids of questions where last answer was incorrect", () => {
    saveAnswer(makeAnswer({ questionId: "q1", isCorrect: false }));
    expect(getIncorrectQuestionIds()).toContain("q1");
  });

  it("excludes ids where last answer was correct", () => {
    saveAnswer(makeAnswer({ questionId: "q1", isCorrect: false }));
    saveAnswer(makeAnswer({ questionId: "q1", isCorrect: true }));
    expect(getIncorrectQuestionIds()).not.toContain("q1");
  });
});

describe("clearHistory", () => {
  it("clears all stored data", () => {
    saveAnswer(makeAnswer());
    addBookmark("q1");
    clearHistory();
    expect(getAnswerHistory()).toEqual([]);
    expect(getBookmarkedIds()).toEqual([]);
  });
});
