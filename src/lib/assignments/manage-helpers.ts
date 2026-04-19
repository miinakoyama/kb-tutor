import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import type { AppRole } from "@/lib/auth/types";
import type {
  Diagram,
  DiagramType,
  DOKLevel,
  Question,
  QuestionType,
  RationaleQuestion,
} from "@/types/question";
import { normalizeQuestionGlossaryTerms } from "@/lib/glossary";

export type AssignmentSourceType = "existing_set" | "generated_now" | "manual";
export type AssignmentMode = "practice" | "exam" | "review";

export interface Requester {
  id: string;
  role: AppRole;
}

export type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function asDokLevel(value: unknown): DOKLevel | undefined {
  if (typeof value !== "number") return undefined;
  if (value === 1 || value === 2 || value === 3) return value;
  return undefined;
}

export function asQuestionType(value: unknown): QuestionType | undefined {
  if (value === "mcq" || value === "open-ended") return value;
  return undefined;
}

const DIAGRAM_TYPES: readonly DiagramType[] = [
  "chart",
  "table",
  "flowchart",
  "diagram",
];

/**
 * Pass-through validator for a Question.diagram payload. The Diagram.data
 * union is large (chart / table / flowchart / svg variants) so we do not
 * deeply validate it — we only ensure the shape has a known `type` and an
 * object `data` field, then preserve the rest as-is so the DiagramRenderer
 * can handle it.
 */
export function asDiagram(value: unknown): Diagram | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const type = source.type;
  if (typeof type !== "string") return undefined;
  if (!(DIAGRAM_TYPES as readonly string[]).includes(type)) return undefined;
  if (!source.data || typeof source.data !== "object") return undefined;
  return value as Diagram;
}

export function asRationaleQuestion(
  value: unknown,
): RationaleQuestion | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const text = asOptionalString(source.text);
  if (!text) return undefined;
  const rawOptions = Array.isArray(source.options) ? source.options : [];
  const options = rawOptions
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const entry = item as Record<string, unknown>;
      const optionText = asOptionalString(entry.text);
      const optionId = asOptionalString(entry.id) ?? `opt_${index + 1}`;
      return optionText ? { id: optionId, text: optionText } : null;
    })
    .filter((item): item is { id: string; text: string } => item !== null);
  if (options.length < 2) return undefined;
  const correctOptionId =
    typeof source.correctOptionId === "string" &&
    options.some((option) => option.id === source.correctOptionId)
      ? source.correctOptionId
      : options[0].id;
  const explanation = asOptionalString(source.explanation) ?? "";
  return {
    text,
    options,
    correctOptionId,
    explanation,
  };
}

export function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0),
    ),
  );
}

export function sanitizeMode(value: unknown): AssignmentMode {
  if (value === "practice" || value === "exam" || value === "review") {
    return value;
  }
  return "practice";
}

export async function getRequester(): Promise<Requester | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("[getRequester] Auth error:", userError.message);
    return null;
  }
  if (!user) {
    console.error("[getRequester] No user in session");
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("[getRequester] Profile query warning:", profileError.message);
  }

  const role = await resolveRoleWithServerFallback(user, profile?.role);

  if (!role) {
    console.warn("[getRequester] Could not resolve role for user:", user.id);
    return null;
  }

  return { id: user.id, role };
}

type SchoolRow = { id: string; name: string; teacher_user_id: string | null };

export async function getScopedSchoolIds(
  admin: AdminClient,
  requester: Requester,
): Promise<{ schools: SchoolRow[] } | { error: string; schools: SchoolRow[] }> {
  if (requester.role === "teacher") {
    const [
      { data: schoolTeachers, error: schoolTeacherError },
      { data: legacySchools, error: legacyError },
    ] = await Promise.all([
      admin
        .from("school_teachers")
        .select("school_id")
        .eq("teacher_user_id", requester.id),
      admin
        .from("schools")
        .select("id")
        .eq("teacher_user_id", requester.id),
    ]);
    if (schoolTeacherError) {
      return { error: schoolTeacherError.message, schools: [] };
    }
    if (legacyError) {
      return { error: legacyError.message, schools: [] };
    }
    const schoolIds = Array.from(
      new Set([
        ...(schoolTeachers ?? []).map((row) => row.school_id),
        ...(legacySchools ?? []).map((row) => row.id),
      ]),
    );
    if (schoolIds.length === 0) {
      return { schools: [] };
    }
    const { data, error } = await admin
      .from("schools")
      .select("id,name,teacher_user_id")
      .in("id", schoolIds)
      .order("name", { ascending: true });
    if (error) {
      return { error: error.message, schools: [] };
    }
    return { schools: data ?? [] };
  }
  const { data, error } = await admin
    .from("schools")
    .select("id,name,teacher_user_id")
    .order("name", { ascending: true });
  if (error) return { error: error.message, schools: [] };
  return { schools: data ?? [] };
}

export function normalizeQuestionPayload(
  raw: unknown,
  index: number,
  sourceType: AssignmentSourceType,
): Question | null {
  if (!raw || typeof raw !== "object") return null;
  const question = raw as Record<string, unknown>;
  const text = typeof question.text === "string" ? question.text.trim() : "";
  if (!text) return null;

  const topic =
    typeof question.topic === "string" && question.topic.trim()
      ? question.topic.trim()
      : "Assignment";
  const moduleNumber =
    typeof question.module === "number" && Number.isFinite(question.module)
      ? Math.max(1, Math.round(question.module))
      : 1;

  const optionsRaw = Array.isArray(question.options) ? question.options : [];
  const options = optionsRaw
    .filter((item) => item && typeof item === "object")
    .map((item, optionIndex) => {
      const value = item as Record<string, unknown>;
      const textValue = typeof value.text === "string" ? value.text : "";
      const feedbackValue = asOptionalString(value.feedback);
      return {
        id:
          typeof value.id === "string" && value.id.trim()
            ? value.id
            : `opt_${optionIndex + 1}`,
        text: textValue,
        feedback: feedbackValue,
      };
    })
    .filter((item) => item.text.trim().length > 0);

  if (options.length < 2) return null;

  const correctOptionId =
    typeof question.correctOptionId === "string" &&
    options.some((option) => option.id === question.correctOptionId)
      ? question.correctOptionId
      : options[0].id;

  const { inlineTerms, sidebarTerms } = normalizeQuestionGlossaryTerms(
    question.inlineTerms,
    question.sidebarTerms,
    `${sourceType}-${index + 1}`,
  );

  const imageUrl =
    typeof question.imageUrl === "string" && question.imageUrl.trim()
      ? question.imageUrl
      : null;

  const diagram = asDiagram(question.diagram);

  return {
    id:
      typeof question.id === "string" && question.id.trim()
        ? question.id
        : `assignment-${sourceType}-${Date.now()}-${index + 1}`,
    module: moduleNumber,
    topic,
    standardId:
      typeof question.standardId === "string" ? question.standardId : undefined,
    standardLabel:
      typeof question.standardLabel === "string"
        ? question.standardLabel
        : undefined,
    text,
    imageUrl,
    options,
    correctOptionId,
    explanation: asOptionalString(question.explanation),
    focusHint: asOptionalString(question.focusHint),
    keyKnowledge: asOptionalString(question.keyKnowledge),
    commonMisconception: asOptionalString(question.commonMisconception),
    dok: asDokLevel(question.dok),
    questionType: asQuestionType(question.questionType),
    rationaleQuestion: asRationaleQuestion(question.rationaleQuestion),
    inlineTerms,
    sidebarTerms,
    diagram,
    source: "generated",
    isVisible: true,
    generatedAt: new Date().toISOString(),
  };
}

async function resolveSelectedQuestions(
  admin: AdminClient,
  requester: Requester,
  selection: Array<{ setId: string; questionIds: string[] }>,
): Promise<{ questions: Question[] } | { error: string; status: number }> {
  const cleanedSelection = selection
    .map((entry) => ({
      setId: typeof entry.setId === "string" ? entry.setId.trim() : "",
      questionIds: Array.isArray(entry.questionIds)
        ? entry.questionIds.filter(
            (id): id is string => typeof id === "string" && id.trim().length > 0,
          )
        : [],
    }))
    .filter((entry) => entry.setId.length > 0 && entry.questionIds.length > 0);

  if (cleanedSelection.length === 0) {
    return { error: "No questions selected.", status: 400 };
  }

  const setIds = Array.from(new Set(cleanedSelection.map((entry) => entry.setId)));

  let setQuery = admin
    .from("generated_question_sets")
    .select("id,user_id")
    .in("id", setIds);
  if (requester.role === "teacher") {
    setQuery = setQuery.eq("user_id", requester.id);
  }
  const { data: accessibleSets, error: setError } = await setQuery;
  if (setError) {
    return { error: setError.message, status: 400 };
  }
  const accessibleSetIds = new Set(
    (accessibleSets ?? []).map((row) => String(row.id)),
  );
  const inaccessible = setIds.find((id) => !accessibleSetIds.has(id));
  if (inaccessible) {
    return { error: "Some question sets are not accessible.", status: 403 };
  }

  const { data: questionRows, error: questionError } = await admin
    .from("generated_questions")
    .select("set_id,id,payload,created_at")
    .in("set_id", setIds)
    .order("created_at", { ascending: true });
  if (questionError) {
    return { error: questionError.message, status: 400 };
  }

  const questionsBySet = new Map<string, Map<string, unknown>>();
  for (const row of questionRows ?? []) {
    const setId = String(row.set_id);
    const questionId = String(row.id);
    if (!questionsBySet.has(setId)) {
      questionsBySet.set(setId, new Map());
    }
    questionsBySet.get(setId)!.set(questionId, row.payload);
  }

  const questions: Question[] = [];
  let runningIndex = 0;
  for (const entry of cleanedSelection) {
    const pool = questionsBySet.get(entry.setId);
    if (!pool) continue;
    for (const questionId of entry.questionIds) {
      const payload = pool.get(questionId);
      if (!payload) continue;
      const normalized = normalizeQuestionPayload(
        payload,
        runningIndex,
        "existing_set",
      );
      if (normalized) {
        questions.push(normalized);
        runningIndex += 1;
      }
    }
  }

  if (questions.length === 0) {
    return { error: "Selected questions could not be resolved.", status: 400 };
  }
  return { questions };
}

export async function resolveSnapshotQuestions(
  admin: AdminClient,
  requester: Requester,
  body: {
    sourceType?: AssignmentSourceType;
    existingSetId?: string;
    selectedQuestions?: Array<{ setId: string; questionIds: string[] }>;
    generatedQuestions?: unknown[];
    manualQuestions?: unknown[];
  },
): Promise<
  | { questions: Question[]; sourceType: AssignmentSourceType }
  | { error: string; status: number }
> {
  if (Array.isArray(body.selectedQuestions) && body.selectedQuestions.length > 0) {
    const result = await resolveSelectedQuestions(
      admin,
      requester,
      body.selectedQuestions,
    );
    if ("error" in result) return result;
    return { questions: result.questions, sourceType: "existing_set" };
  }

  const sourceType = body.sourceType ?? "existing_set";

  if (sourceType === "existing_set") {
    const setId = body.existingSetId?.trim();
    if (!setId) {
      return { error: "Missing question set id.", status: 400 };
    }
    let setQuery = admin
      .from("generated_question_sets")
      .select("id,user_id")
      .eq("id", setId);
    if (requester.role === "teacher") {
      setQuery = setQuery.eq("user_id", requester.id);
    }
    const { data: setRow, error: setError } = await setQuery.maybeSingle();
    if (setError) {
      return { error: setError.message, status: 400 };
    }
    if (!setRow) {
      return { error: "Question set not found or not accessible.", status: 403 };
    }

    const { data: questionRows, error: questionError } = await admin
      .from("generated_questions")
      .select("payload,created_at")
      .eq("set_id", setId)
      .order("created_at", { ascending: true });
    if (questionError) {
      return { error: questionError.message, status: 400 };
    }

    const questions = (questionRows ?? [])
      .map((row, index) =>
        normalizeQuestionPayload(row.payload, index, "existing_set"),
      )
      .filter((row): row is Question => row !== null);
    if (questions.length === 0) {
      return {
        error: "Selected question set has no usable questions.",
        status: 400,
      };
    }
    return { questions, sourceType: "existing_set" };
  }

  if (sourceType === "generated_now") {
    const questions = (body.generatedQuestions ?? [])
      .map((row, index) =>
        normalizeQuestionPayload(row, index, "generated_now"),
      )
      .filter((row): row is Question => row !== null);
    if (questions.length === 0) {
      return { error: "Generated questions are missing or invalid.", status: 400 };
    }
    return { questions, sourceType: "generated_now" };
  }

  if (sourceType === "manual") {
    const questions = (body.manualQuestions ?? [])
      .map((row, index) => normalizeQuestionPayload(row, index, "manual"))
      .filter((row): row is Question => row !== null);
    if (questions.length === 0) {
      return { error: "Manual questions are missing or invalid.", status: 400 };
    }
    return { questions, sourceType: "manual" };
  }

  return { error: "Invalid source type.", status: 400 };
}
