import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadStandardMetricsCsv,
  downloadStudentMetricsCsv,
} from "@/lib/csv/teacher-dashboard";
import type {
  StandardMetric,
  StudentMetric,
} from "@/lib/analytics/teacher-dashboard";

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

  const originalAppend = document.body.appendChild.bind(document.body);
  const appendSpy = <T extends Node>(node: T): T => {
    const anchor = node as unknown as HTMLAnchorElement;
    if (anchor.tagName === "A") {
      captured.fileName = anchor.download;
      anchor.click = vi.fn();
    }
    return originalAppend(node);
  };
  document.body.appendChild = appendSpy as typeof document.body.appendChild;

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
      document.body.appendChild = originalAppend as typeof document.body.appendChild;
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
    const rows: StandardMetric[] = [
      {
        standardId: "3.1.9-12.A",
        standardLabel: "Label A",
        attempted: 10,
        correct: 7,
        accuracy: 70,
        averageTimeSec: 45,
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
  });

  it("escapes values that contain commas or quotes", () => {
    const rows: StandardMetric[] = [
      {
        standardId: "S1",
        standardLabel: 'Label, with "quotes"',
        attempted: 1,
        correct: 1,
        accuracy: 100,
        averageTimeSec: 0,
      },
    ];
    downloadStandardMetricsCsv(rows);
    const text = harness.captured.text ?? "";
    expect(text).toContain('"Label, with ""quotes"""');
  });
});

describe("downloadStudentMetricsCsv", () => {
  it("writes student metrics with the expected header", () => {
    const rows: StudentMetric[] = [
      {
        studentId: "s1",
        totalAnswered: 8,
        totalCorrect: 6,
        accuracy: 75,
      },
    ];
    downloadStudentMetricsCsv(rows);
    expect(harness.captured.fileName).toBe("teacher-dashboard-by-student.csv");
    const text = harness.captured.text ?? "";
    expect(text.split("\n")[0]).toBe(
      "student_id,total_answered,total_correct,accuracy_percent",
    );
    expect(text).toContain("s1,8,6,75");
  });
});
