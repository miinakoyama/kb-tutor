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

function validateSettings(settings: unknown): settings is GenerationSettings {
  if (!settings || typeof settings !== "object") return false;
  
  const s = settings as Record<string, unknown>;
  
  if (typeof s.questionCount !== "number" || s.questionCount < 1 || s.questionCount > 20) {
    return false;
  }
  
  if (!Array.isArray(s.topics) || s.topics.length === 0) {
    return false;
  }
  
  if (!Array.isArray(s.dokLevels) || s.dokLevels.length === 0) {
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

    const prompt = buildGenerationPrompt(body);
    
    const responseText = await generateWithGemini(prompt);
    
    const rawQuestions = parseGeneratedQuestions(responseText);
    
    const validQuestions: Question[] = [];
    for (let i = 0; i < rawQuestions.length; i++) {
      const validated = validateQuestion(rawQuestions[i], i);
      if (validated) {
        validQuestions.push(validated);
      }
    }

    if (validQuestions.length === 0) {
      return NextResponse.json(
        { error: "Failed to generate valid questions. Please try again." },
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
