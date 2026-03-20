import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function generateWithGemini(prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "	gemini-3.1-flash-lite-preview",
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    },
  });

  const response = result.response;
  const text = response.text();

  return text;
}

export function parseGeneratedQuestions(text: string): unknown[] {
  let jsonText = text.trim();

  if (jsonText.startsWith("```json")) {
    jsonText = jsonText.slice(7);
  } else if (jsonText.startsWith("```")) {
    jsonText = jsonText.slice(3);
  }

  if (jsonText.endsWith("```")) {
    jsonText = jsonText.slice(0, -3);
  }

  jsonText = jsonText.trim();

  const questions = JSON.parse(jsonText);

  if (!Array.isArray(questions)) {
    throw new Error("Response is not an array of questions");
  }

  return questions;
}
