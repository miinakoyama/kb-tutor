import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadStandardMetricsCsv,
  downloadStudentMetricsCsv,
} from "@/lib/csv/teacher-dashboard";
import type {
  StandardRow,
  StudentRow,
} from "@/lib/analytics/teacher-dashboard-server";

/**
 * Captures downloaded CSV content by stubbing `Blob`, `URL.createObjectURL`,
 * and the anchor click. The text content of the synthesized blob is stored
 * on `capturedText` for assertions.
 */
function setupDownloadCapture() {
  const captured: { text: string | null; fileName: string | null } = {
    text: null,
    fileName: null,
  };
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  URL.createObjectURL = vi.fn(() => "blob:mocked") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();

  const originalAppend = document.body.appendChild;
  const appendChildSpy = vi.spyOn(document.body, "appendChild");
  appendChildSpy.mockImplementation(
    ((node: Node): Node => {
      const anchor = node as HTMLAnchorElement;
      if (anchor.tagName === "A") {
        captured.fileName = anchor.download;
        anchor.click = vi.fn();
      }
      return originalAppend.call(document.body, node);
    }) as typeof document.body.appendChild,
  );

  const originalBlob = globalThis.Blob;
  globalThis.Blob = class extends originalBlob {
    constructor(parts: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options);
      captured.text = parts.map((p) => String(p)).join("");
    }
  } as unknown as typeof Blob;

  return {
    captured,
    restore: () => {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      globalThis.Blob = originalBlob;
      appendChildSpy.mockRestore();
    },
  };
}

let harness: ReturnType<typeof setupDownloadCapture>;

beforeEach(() => {
  harness = setupDownloadCapture();
});

afterEach(() => {
  harness.restore();
});

describe("downloadStandardMetricsCsv", () => {
  it("includes a header row and one row per metric", () => {
    const rows: StandardRow[] = [
      {
        standardId: "3.1.9-12.A",
        standardLabel: "Label A",
        module: "A",
        category: "Structure and Function",
        attempted: 10,
        correct: 7,
        accuracy: 70,
        averageTimeSec: 45,
        studentsAttempted: 5,
        status: "basic",
      },
    ];
    downloadStandardMetricsCsv(rows);
    expect(harness.captured.fileName).toBe(
      "teacher-dashboard-by-standard.csv",
    );
    const text = harness.captured.text ?? "";
    expect(text.split("\n")[0]).toContain("standard_id");
    expect(text).toContain("3.1.9-12.A");
    expect(text).toContain("70");
    expect(text).toContain("basic");
  });

  it("escapes values that contain commas or quotes", () => {
    const rows: StandardRow[] = [
      {
        standardId: "S1",
        standardLabel: 'Label, with "quotes"',
        module: null,
        category: null,
        attempted: 1,
        correct: 1,
        accuracy: 100,
        averageTimeSec: 0,
        studentsAttempted: 1,
        status: "advanced",
      },
    ];
    downloadStandardMetricsCsv(rows);
    const text = harness.captured.text ?? "";
    expect(text).toContain('"Label, with ""quotes"""');
  });

  it("includes per-mode student counts for compare exports", () => {
    const rows: StandardRow[] = [
      {
        standardId: "S1",
        standardLabel: "Label A",
        module: null,
        category: null,
        attempted: 8,
        correct: 5,
        accuracy: 63,
        averageTimeSec: 40,
        studentsAttempted: 4,
        status: "basic",
        byMode: {
          practice: {
            attempted: 4,
            correct: 3,
            accuracy: 75,
            averageTimeSec: 35,
            studentsAttempted: 2,
          },
          exam: {
            attempted: 3,
            correct: 1,
            accuracy: 33,
            averageTimeSec: 50,
            studentsAttempted: 1,
          },
          review: {
            attempted: 1,
            correct: 1,
            accuracy: 100,
            averageTimeSec: 25,
            studentsAttempted: 1,
          },
        },
      },
    ];

    downloadStandardMetricsCsv(rows);
    const text = harness.captured.text ?? "";
    expect(text.split("\n")[0]).toBe(
      "standard_id,standard_label,attempted,correct,accuracy_percent,average_time_seconds,status,practice_attempted,practice_correct,practice_accuracy_percent,practice_students,exam_attempted,exam_correct,exam_accuracy_percent,exam_students,review_attempted,review_correct,review_accuracy_percent,review_students",
    );
    expect(text).toContain("S1,Label A,8,5,63,40,basic,4,3,75,2,3,1,33,1,1,1,100,1");
  });
});

describe("downloadStudentMetricsCsv", () => {
  it("writes student metrics with the expected header", () => {
    const rows: StudentRow[] = [
      {
        studentId: "s1",
        label: "Student One",
        classId: "class-a",
        attempted: 8,
        correct: 6,
        accuracy: 75,
        averageTimeSec: 52,
        status: "proficient",
        isLowAndFast: false,
      },
    ];
    downloadStudentMetricsCsv(rows);
    expect(harness.captured.fileName).toBe("teacher-dashboard-by-student.csv");
    const text = harness.captured.text ?? "";
    expect(text.split("\n")[0]).toBe(
      "student_id,student_label,attempted,correct,accuracy_percent,average_time_seconds,status,low_and_fast",
    );
    expect(text).toContain("s1,Student One,8,6,75,52,proficient,no");
  });
});
