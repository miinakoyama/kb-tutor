import { NextResponse } from "next/server";
import { jsonrepair } from "jsonrepair";
import { generateWithGemini } from "@/lib/gemini";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { getAllStandards, getStandardById } from "@/lib/standards";

interface EnrichRequestOption {
  id?: string;
  text?: string;
  feedback?: string;
}

interface EnrichRequestBody {
  text?: string;
  options?: EnrichRequestOption[];
  correctOptionId?: string;
  standardId?: string;
  existing?: {
    standardId?: string;
    dok?: number;
    commonMisconception?: string;
    focusHint?: string;
    keyKnowledge?: string;
    inlineTerms?: Array<{ term?: string; definition?: string; example?: string }>;
    sidebarTerms?: Array<{ term?: string; definition?: string; example?: string }>;
  };
}

function stripCodeFence(text: string): string {
  let value = text.trim();
  if (value.startsWith("```json")) value = value.slice(7);
  else if (value.startsWith("```")) value = value.slice(3);
  if (value.endsWith("```")) value = value.slice(0, -3);
  return value.trim();
}

function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}

function parseEnrichmentResponse(raw: string): Record<string, unknown> {
  const cleaned = stripCodeFence(raw);
  const candidates = [cleaned, extractJsonObject(cleaned)];
  for (const candidate of candidates) {
    try {
      candidates.push(jsonrepair(candidate));
    } catch {
      // ignore
    }
  }
  let parsed: unknown = null;
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!parsed || typeof parsed !== "object") {
    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to parse AI response");
  }
  return parsed as Record<string, unknown>;
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasContent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

function sanitizeGlossaryTerms(value: unknown): Array<{ term: string; definition: string; example?: string }> {
  if (!Array.isArray(value)) return [];
  const result: Array<{ term: string; definition: string; example?: string }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    const term = toTrimmedString(source.term);
    const definition = toTrimmedString(source.definition);
    if (!term || !definition) continue;
    const example = toTrimmedString(source.example);
    result.push(example ? { term, definition, example } : { term, definition });
  }
  return result;
}

function buildPrompt(
  body: EnrichRequestBody,
  missing: string[],
  optionsNeedingFeedback: EnrichRequestOption[],
  includeStandardCatalog: boolean,
): string {
  const safeOptions = (body.options ?? [])
    .map((option, index) => {
      const id = option?.id?.trim() || `opt_${index + 1}`;
      const text = option?.text?.trim() ?? "";
      const isCorrect = id === body.correctOptionId;
      return `  - ${id}${isCorrect ? " (correct)" : ""}: ${text}`;
    })
    .join("\n");

  const resolvedStandard = body.standardId
    ? getStandardById(body.standardId)
    : undefined;

  const contextLines: string[] = [];
  if (resolvedStandard) {
    contextLines.push(
      `Standard: ${resolvedStandard.id} - ${resolvedStandard.category} - ${resolvedStandard.label}`,
    );
  }

  const standardsCatalog = includeStandardCatalog
    ? `\nAvailable standards (pick ONE exact id when generating "standardId"):\n${getAllStandards()
        .map(
          (standard) =>
            `- ${standard.id} | Module ${standard.module} | ${standard.category}: ${standard.label}`,
        )
        .join("\n")}\n`
    : "";

  const feedbackIds = optionsNeedingFeedback.map(
    (option, index) => option?.id?.trim() || `opt_${index + 1}`,
  );

  const keyDescriptions: string[] = [];
  if (missing.includes("optionFeedback")) {
    keyDescriptions.push(
      `- optionFeedback: object keyed by option id. Provide feedback ONLY for these option ids: [${feedbackIds.join(
        ", ",
      )}]. Each value is a concise 1-2 sentence explanation of why that option is correct or incorrect. For the correct option, reinforce the key reasoning; for incorrect ones, target the likely misconception.`,
    );
  }
  if (missing.includes("standardId")) {
    keyDescriptions.push(
      `- standardId: pick the single best matching standard id (must be one of the ids above exactly, e.g. "3.1.9-12.P").`,
    );
  }
  if (missing.includes("dok")) {
    keyDescriptions.push(
      `- dok: integer 1, 2, or 3 indicating Depth of Knowledge level.`,
    );
  }
  if (missing.includes("commonMisconception")) {
    keyDescriptions.push(
      `- commonMisconception: one sentence describing the most common student misconception related to this question.`,
    );
  }
  if (missing.includes("focusHint")) {
    keyDescriptions.push(
      `- focusHint: one short sentence (<= 15 words) focusing the student on the key idea.`,
    );
  }
  if (missing.includes("keyKnowledge")) {
    keyDescriptions.push(
      `- keyKnowledge: one short sentence summarizing the key concept required to answer.`,
    );
  }
  if (missing.includes("inlineTerms")) {
    keyDescriptions.push(
      `- inlineTerms: array of up to 4 glossary entries for terminology that appears inline in the stem or options. Each entry has { term, definition, example }. Keep definitions short (<= 25 words).`,
    );
  }
  if (missing.includes("sidebarTerms")) {
    keyDescriptions.push(
      `- sidebarTerms: array of up to 3 additional glossary entries useful for the sidebar (related background terms). Each entry has { term, definition, example }.`,
    );
  }

  return `You are an expert high-school biology question author. Enrich the following multiple-choice question with supporting pedagogy content. Return JSON only.

Question stem:
${body.text ?? ""}

Options:
${safeOptions}

${contextLines.length > 0 ? `Context:\n${contextLines.join("\n")}\n` : ""}${standardsCatalog}
Generate JSON with ONLY these keys:
${keyDescriptions.join("\n")}

Do not rewrite the stem, options, or correct answer.
Return raw JSON only - no markdown, no commentary.`;
}

async function requireAuthorizedUser(): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, profile?.role);
  if (!role || !["teacher", "admin"].includes(role)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true };
}

export async function POST(request: Request) {
  const auth = await requireAuthorizedUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as EnrichRequestBody;

  const stem = body.text?.trim();
  const options = Array.isArray(body.options) ? body.options : [];
  const validOptions = options.filter((option) => option?.text?.trim()).length;
  if (!stem || validOptions < 2 || !body.correctOptionId) {
    return NextResponse.json(
      {
        error:
          "Provide the question stem, at least two options, and select the correct answer before generating.",
      },
      { status: 400 },
    );
  }

  const existing = body.existing ?? {};

  const optionsNeedingFeedback = options.filter(
    (option) =>
      typeof option?.text === "string" &&
      option.text.trim().length > 0 &&
      !(typeof option?.feedback === "string" && option.feedback.trim().length > 0),
  );

  const missing: string[] = [];
  if (optionsNeedingFeedback.length > 0) missing.push("optionFeedback");
  if (!hasContent(existing.standardId)) missing.push("standardId");
  if (!hasContent(existing.dok)) missing.push("dok");
  if (!hasContent(existing.commonMisconception)) missing.push("commonMisconception");
  if (!hasContent(existing.focusHint)) missing.push("focusHint");
  if (!hasContent(existing.keyKnowledge)) missing.push("keyKnowledge");
  if (!hasContent(existing.inlineTerms)) missing.push("inlineTerms");
  if (!hasContent(existing.sidebarTerms)) missing.push("sidebarTerms");

  if (missing.length === 0) {
    return NextResponse.json({ filled: {}, filledFields: [] });
  }

  const includeStandardCatalog = missing.includes("standardId");

  let responseText: string;
  try {
    const result = await generateWithGemini(
      buildPrompt(body, missing, optionsNeedingFeedback, includeStandardCatalog),
    );
    responseText = result.text;
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseEnrichmentResponse(responseText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not parse AI response";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const filled: Record<string, unknown> = {};
  const filledFields: string[] = [];

  if (missing.includes("optionFeedback")) {
    const raw = parsed.optionFeedback;
    if (raw && typeof raw === "object") {
      const source = raw as Record<string, unknown>;
      const feedbackByOption: Record<string, string> = {};
      for (const option of optionsNeedingFeedback) {
        const id = option.id?.trim();
        if (!id) continue;
        const value = toTrimmedString(source[id]);
        if (value) feedbackByOption[id] = value;
      }
      if (Object.keys(feedbackByOption).length > 0) {
        filled.optionFeedback = feedbackByOption;
        filledFields.push(
          `optionFeedback (${Object.keys(feedbackByOption).length})`,
        );
      }
    }
  }
  if (missing.includes("standardId")) {
    const value = toTrimmedString(parsed.standardId);
    if (value && getStandardById(value)) {
      filled.standardId = value;
      filledFields.push("standard");
    }
  }
  if (missing.includes("dok")) {
    const rawDok = parsed.dok;
    const dokNumber =
      typeof rawDok === "number"
        ? rawDok
        : typeof rawDok === "string"
          ? parseInt(rawDok, 10)
          : NaN;
    if (dokNumber === 1 || dokNumber === 2 || dokNumber === 3) {
      filled.dok = dokNumber;
      filledFields.push("DOK");
    }
  }
  if (missing.includes("commonMisconception")) {
    const value = toTrimmedString(parsed.commonMisconception);
    if (value) {
      filled.commonMisconception = value;
      filledFields.push("commonMisconception");
    }
  }
  if (missing.includes("focusHint")) {
    const value = toTrimmedString(parsed.focusHint);
    if (value) {
      filled.focusHint = value;
      filledFields.push("focusHint");
    }
  }
  if (missing.includes("keyKnowledge")) {
    const value = toTrimmedString(parsed.keyKnowledge);
    if (value) {
      filled.keyKnowledge = value;
      filledFields.push("keyKnowledge");
    }
  }
  if (missing.includes("inlineTerms")) {
    const terms = sanitizeGlossaryTerms(parsed.inlineTerms);
    if (terms.length > 0) {
      filled.inlineTerms = terms;
      filledFields.push("inlineTerms");
    }
  }
  if (missing.includes("sidebarTerms")) {
    const terms = sanitizeGlossaryTerms(parsed.sidebarTerms);
    if (terms.length > 0) {
      filled.sidebarTerms = terms;
      filledFields.push("sidebarTerms");
    }
  }

  return NextResponse.json({ filled, filledFields });
}
