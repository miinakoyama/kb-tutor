/**
 * LLM provider credentials. Server-side only — these keys must never be
 * exposed to clients (no NEXT_PUBLIC_ variants). This module is the single
 * non-Supabase process.env access point (see plan.md Complexity Tracking).
 */

export function getOpenAIKey(): string {
  const value = process.env.OPENAI_API_KEY;
  if (!value) {
    throw new Error("Missing OPENAI_API_KEY (server-side env)");
  }
  return value;
}

export function getAnthropicKey(): string {
  const value = process.env.ANTHROPIC_API_KEY;
  if (!value) {
    throw new Error("Missing ANTHROPIC_API_KEY (server-side env)");
  }
  return value;
}

export function getGeminiKey(): string {
  const value = process.env.GEMINI_API_KEY;
  if (!value) {
    throw new Error("Missing GEMINI_API_KEY (server-side env)");
  }
  return value;
}
