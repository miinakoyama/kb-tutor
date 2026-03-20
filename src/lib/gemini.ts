import { GoogleGenerativeAI } from "@google/generative-ai";
import { jsonrepair } from "jsonrepair";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

function stripMarkdownCodeFence(text: string): string {
  let jsonText = text.trim();

  if (jsonText.startsWith("```json")) {
    jsonText = jsonText.slice(7);
  } else if (jsonText.startsWith("```")) {
    jsonText = jsonText.slice(3);
  }

  if (jsonText.endsWith("```")) {
    jsonText = jsonText.slice(0, -3);
  }

  return jsonText.trim();
}

function extractJsonArray(text: string): string {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return text;
  }
  return text.slice(start, end + 1);
}

function normalizeSvgWhitespace(svg: string): string {
  return svg.replace(/\s+/g, " ").trim();
}

function repairBrokenSvgStrings(jsonText: string): string {
  // Repairs common LLM failure case:
  // "svg": "<svg ... "unescaped quotes"... </svg>"
  // by rebuilding the svg value as a valid JSON string.
  const svgKeyRegex = /"svg"\s*:\s*"/g;
  let result = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = svgKeyRegex.exec(jsonText)) !== null) {
    const keyStart = match.index;
    const valueStart = keyStart + match[0].length;
    const svgEnd = jsonText.indexOf("</svg>", valueStart);
    if (svgEnd === -1) {
      continue;
    }

    const rawSvg = jsonText.slice(valueStart, svgEnd + "</svg>".length);
    const sanitizedSvg = normalizeSvgWhitespace(rawSvg).replaceAll('"', "'");
    const escapedSvg = JSON.stringify(sanitizedSvg); // includes surrounding quotes

    result += jsonText.slice(cursor, valueStart);
    result += escapedSvg.slice(1); // keep existing opening quote from match

    let after = svgEnd + "</svg>".length;
    while (after < jsonText.length && /[\s"]/.test(jsonText[after])) {
      after++;
    }
    cursor = after;
  }

  if (cursor === 0) return jsonText;
  result += jsonText.slice(cursor);
  return result;
}

export async function generateWithGemini(prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite-preview",
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 12288,
    },
  });

  const response = result.response;
  const text = response.text();

  return text;
}

export function parseGeneratedQuestions(text: string): unknown[] {
  const cleaned = stripMarkdownCodeFence(text);
  const baseCandidates = [
    cleaned,
    extractJsonArray(cleaned),
    repairBrokenSvgStrings(cleaned),
    repairBrokenSvgStrings(extractJsonArray(cleaned)),
  ];
  const candidates = [...baseCandidates];

  for (const candidate of baseCandidates) {
    try {
      candidates.push(jsonrepair(candidate));
    } catch {
      // ignore jsonrepair failures for this candidate
    }
  }

  let questions: unknown = null;
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      questions = JSON.parse(candidate);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (questions === null) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to parse generated JSON response");
  }

  if (!Array.isArray(questions)) {
    throw new Error("Response is not an array of questions");
  }

  return questions;
}
