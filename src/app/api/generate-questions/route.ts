import { NextRequest, NextResponse } from "next/server";
import { generateWithGemini, parseGeneratedQuestions } from "@/lib/gemini";
import { buildGenerationPrompt } from "@/lib/prompts";
import type { Question, DOKLevel } from "@/types/question";

interface GenerationSettings {
  questionSetName: string;
  questionCount: number;
  topics: string[];
  dokLevels: DOKLevel[];
  includeDiagrams: boolean;
  diagramConfig: {
    chart: number;
    table: number;
    flowchart: number;
    diagram: number;
  };
  customPrompt: string;
}

const MAX_GENERATION_ATTEMPTS = 5;

function validateSettings(settings: unknown): settings is GenerationSettings {
  if (!settings || typeof settings !== "object") return false;
  
  const s = settings as Record<string, unknown>;

  if (typeof s.questionSetName !== "string" || s.questionSetName.trim().length === 0) {
    return false;
  }
  
  if (typeof s.questionCount !== "number" || s.questionCount < 1 || s.questionCount > 20) {
    return false;
  }
  
  if (!Array.isArray(s.topics) || s.topics.length === 0) {
    return false;
  }
  
  if (!Array.isArray(s.dokLevels) || s.dokLevels.length === 0) {
    return false;
  }

  if (typeof s.includeDiagrams !== "boolean") {
    return false;
  }

  if (!s.diagramConfig || typeof s.diagramConfig !== "object") {
    return false;
  }

  const dc = s.diagramConfig as Record<string, unknown>;
  const diagramKeys = ["chart", "table", "flowchart", "diagram"] as const;
  for (const key of diagramKeys) {
    if (typeof dc[key] !== "number" || (dc[key] as number) < 0) {
      return false;
    }
  }

  const requestedDiagramTotal =
    (dc.chart as number) +
    (dc.table as number) +
    (dc.flowchart as number) +
    (dc.diagram as number);
  if (requestedDiagramTotal > (s.questionCount as number)) {
    return false;
  }
  
  return true;
}

function validateQuestion(q: unknown, index: number): Question | null {
  if (!q || typeof q !== "object") return null;
  
  const question = q as Record<string, unknown>;
  
  const requiredFields = ["text", "options", "correctOptionId", "topic"];
  for (const field of requiredFields) {
    if (!question[field]) {
      console.warn(`Question ${index} missing field: ${field}`);
      return null;
    }
  }
  
  if (!Array.isArray(question.options) || question.options.length !== 4) {
    console.warn(`Question ${index} has invalid options`);
    return null;
  }
  
  const timestamp = Date.now();
  const topicSlug = (question.topic as string)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 20);
  
  return {
    id: `generated-${topicSlug}-${timestamp}-${String(index + 1).padStart(3, "0")}`,
    module: (question.module as number) || 1,
    topic: question.topic as string,
    text: question.text as string,
    imageUrl: null,
    options: question.options as Question["options"],
    correctOptionId: question.correctOptionId as string,
    focusHint: (question.focusHint as string) || undefined,
    keyKnowledge: (question.keyKnowledge as string) || undefined,
    commonMisconception: (question.commonMisconception as string) || undefined,
    rationaleQuestion: question.rationaleQuestion as Question["rationaleQuestion"],
    source: "generated",
    dok: (question.dok as DOKLevel) || 2,
    isVisible: true,
    generatedAt: new Date().toISOString(),
    diagram: question.diagram as Question["diagram"],
  };
}

function getDiagramDistributionSummary(questions: Question[]) {
  const summary = {
    chart: 0,
    table: 0,
    flowchart: 0,
    diagram: 0,
    textOnly: 0,
  };

  for (const question of questions) {
    if (!question.diagram) {
      summary.textOnly++;
      continue;
    }

    if (question.diagram.type === "chart") summary.chart++;
    if (question.diagram.type === "table") summary.table++;
    if (question.diagram.type === "flowchart") summary.flowchart++;
    if (question.diagram.type === "diagram") summary.diagram++;
  }

  return summary;
}

function hasExactDiagramDistribution(
  questions: Question[],
  settings: GenerationSettings
): { ok: boolean; error?: string } {
  if (questions.length !== settings.questionCount) {
    return {
      ok: false,
      error: `Expected exactly ${settings.questionCount} questions, but got ${questions.length}.`,
    };
  }

  const expected = settings.includeDiagrams
    ? settings.diagramConfig
    : { chart: 0, table: 0, flowchart: 0, diagram: 0 };
  const expectedTextOnly =
    settings.questionCount -
    (expected.chart + expected.table + expected.flowchart + expected.diagram);

  const actual = getDiagramDistributionSummary(questions);

  const exactMatch =
    actual.chart === expected.chart &&
    actual.table === expected.table &&
    actual.flowchart === expected.flowchart &&
    actual.diagram === expected.diagram &&
    actual.textOnly === expectedTextOnly;

  if (exactMatch) return { ok: true };

  return {
    ok: false,
    error: `Diagram distribution mismatch. Expected chart=${expected.chart}, table=${expected.table}, flowchart=${expected.flowchart}, diagram=${expected.diagram}, textOnly=${expectedTextOnly}; got chart=${actual.chart}, table=${actual.table}, flowchart=${actual.flowchart}, diagram=${actual.diagram}, textOnly=${actual.textOnly}.`,
  };
}

function tryNormalizeDiagramDistribution(
  questions: Question[],
  settings: GenerationSettings
): { ok: true; questions: Question[] } | { ok: false; reason: string } {
  const expected = settings.includeDiagrams
    ? settings.diagramConfig
    : { chart: 0, table: 0, flowchart: 0, diagram: 0 };
  const expectedTextOnly =
    settings.questionCount -
    (expected.chart + expected.table + expected.flowchart + expected.diagram);

  const byType = {
    chart: questions.filter((q) => q.diagram?.type === "chart"),
    table: questions.filter((q) => q.diagram?.type === "table"),
    flowchart: questions.filter((q) => q.diagram?.type === "flowchart"),
    diagram: questions.filter((q) => q.diagram?.type === "diagram"),
    textOnly: questions.filter((q) => !q.diagram),
  };

  if (byType.chart.length < expected.chart) {
    return { ok: false, reason: `Not enough chart questions (${byType.chart.length}/${expected.chart}).` };
  }
  if (byType.table.length < expected.table) {
    return { ok: false, reason: `Not enough table questions (${byType.table.length}/${expected.table}).` };
  }
  if (byType.flowchart.length < expected.flowchart) {
    return {
      ok: false,
      reason: `Not enough flowchart questions (${byType.flowchart.length}/${expected.flowchart}).`,
    };
  }
  if (byType.diagram.length < expected.diagram) {
    return {
      ok: false,
      reason: `Not enough diagram questions (${byType.diagram.length}/${expected.diagram}).`,
    };
  }
  if (byType.textOnly.length < expectedTextOnly) {
    return {
      ok: false,
      reason: `Not enough text-only questions (${byType.textOnly.length}/${expectedTextOnly}).`,
    };
  }

  const normalized = [
    ...byType.chart.slice(0, expected.chart),
    ...byType.table.slice(0, expected.table),
    ...byType.flowchart.slice(0, expected.flowchart),
    ...byType.diagram.slice(0, expected.diagram),
    ...byType.textOnly.slice(0, expectedTextOnly),
  ].slice(0, settings.questionCount);

  if (normalized.length !== settings.questionCount) {
    return {
      ok: false,
      reason: `Normalization produced ${normalized.length}/${settings.questionCount} questions.`,
    };
  }

  return { ok: true, questions: normalized };
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured. Please add it to your environment variables." },
        { status: 500 }
      );
    }

    const body = await request.json();
    
    if (!validateSettings(body)) {
      return NextResponse.json(
        { error: "Invalid settings provided" },
        { status: 400 }
      );
    }

    const basePrompt = buildGenerationPrompt(body);
    let validQuestions: Question[] = [];
    let lastError: unknown = null;
    let retryReason = "";
    let finalFailureReason = "";

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const retrySuffix =
        attempt === 0
          ? ""
          : `\n\nIMPORTANT RETRY INSTRUCTION: Your previous output was invalid.\nReason: ${retryReason}\nReturn ONLY valid JSON (no markdown, no comments), with EXACTLY ${body.questionCount} questions and exact diagram counts as requested.`;

      try {
        const responseText = await generateWithGemini(`${basePrompt}${retrySuffix}`);
        const rawQuestions = parseGeneratedQuestions(responseText);

        const attemptQuestions: Question[] = [];
        for (let i = 0; i < rawQuestions.length; i++) {
          const validated = validateQuestion(rawQuestions[i], i);
          if (validated) {
            attemptQuestions.push(validated);
          }
        }

        if (attemptQuestions.length === 0) {
          retryReason = "No valid questions after validation.";
          continue;
        }

        const distributionCheck = hasExactDiagramDistribution(attemptQuestions, body);
        if (!distributionCheck.ok) {
          const normalized = tryNormalizeDiagramDistribution(attemptQuestions, body);
          if (normalized.ok) {
            validQuestions = normalized.questions;
            lastError = null;
            break;
          }

          retryReason =
            distributionCheck.error ||
            normalized.reason ||
            "Diagram distribution mismatch.";
          finalFailureReason = retryReason;
          continue;
        }

        validQuestions = attemptQuestions;
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        retryReason =
          error instanceof Error
            ? error.message
            : "Failed to parse generated questions.";
        finalFailureReason = retryReason;
      }
    }

    if (lastError && validQuestions.length === 0) {
      throw lastError instanceof Error
        ? lastError
        : new Error("Failed to generate valid questions");
    }

    if (validQuestions.length === 0) {
      return NextResponse.json(
        {
          error:
            "Failed to generate valid questions with the exact requested diagram distribution. Please try again.",
          details: finalFailureReason || "No additional failure details available.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      questions: validQuestions,
      generatedCount: validQuestions.length,
      requestedCount: body.questionCount,
    });
  } catch (error) {
    console.error("Generation error:", error);
    
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    
    return NextResponse.json(
      { error: `Failed to generate questions: ${message}` },
      { status: 500 }
    );
  }
}
