import { NextResponse } from "next/server";
import { orderTargetKcs, rankQuestionsForKc } from "@/lib/bkt/selection";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStandardById } from "@/lib/standards";
import { filterRenderableQuestions } from "@/lib/short-answer/question-guards";
import type { AdaptiveKcCandidate, AdaptiveQuestionCandidate } from "@/types/bkt";
import type { Question, QuestionTypeSelection } from "@/types/question";

interface NextQuestionBody {
  standardIds?: unknown;
  sessionId?: unknown;
  selectionSeed?: unknown;
  selectionMode?: unknown;
  requiredFormat?: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseBody(
  value: NextQuestionBody,
): {
  standardIds: string[];
  sessionId: string | null;
  selectionSeed: string | null;
  selectionMode: QuestionTypeSelection | undefined;
  requiredFormat: "mcq" | "saq" | undefined;
} | null {
  if (!Array.isArray(value.standardIds)) return null;
  const standardIds = [...new Set(value.standardIds.filter((item): item is string => typeof item === "string" && Boolean(getStandardById(item))))];
  if (!standardIds.length) return null;
  const sessionId = typeof value.sessionId === "string" && UUID_RE.test(value.sessionId) ? value.sessionId : null;
  const selectionSeed = typeof value.selectionSeed === "string" && value.selectionSeed.length <= 128
    ? value.selectionSeed
    : null;
  const selectionMode =
    value.selectionMode === "mcq" ||
    value.selectionMode === "open-ended" ||
    value.selectionMode === "mixed"
      ? value.selectionMode
      : undefined;
  const requiredFormat =
    value.requiredFormat === "mcq" || value.requiredFormat === "saq" ? value.requiredFormat : undefined;
  if (selectionMode === "mixed" && !requiredFormat) return null;
  return { standardIds, sessionId, selectionSeed, selectionMode, requiredFormat };
}

async function loadAdaptiveCandidateRows(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  standardId: string,
  targetKcCode: string,
): Promise<{ data: Record<string, unknown>[]; error: { message: string; code?: string } | null }> {
  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await admin.rpc("get_adaptive_practice_candidates", {
      p_user_id: userId,
      p_standard_id: standardId,
      p_target_kc_code: targetKcCode,
    }).range(from, from + pageSize - 1);
    if (result.error) return { data: [], error: result.error };
    const rawPage: unknown = result.data;
    const page = (Array.isArray(rawPage) ? rawPage : []).filter(
      (row: unknown): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object" && !Array.isArray(row),
    );
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}

function questionFromCandidateRow(row: Record<string, unknown>): Question | null {
  if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) {
    return null;
  }
  const questionId = typeof row.question_id === "string" ? row.question_id : "";
  const questionSetId = typeof row.question_set_id === "string" ? row.question_set_id : "";
  if (!questionId || !questionSetId) return null;
  const payload = row.payload as Question;
  const mappedStandard = typeof row.standard_id === "string"
    ? getStandardById(row.standard_id)
    : undefined;
  const question: Question = {
    ...payload,
    id: questionId,
    questionSetId,
    standardId: payload.standardId ?? mappedStandard?.id,
    standardLabel: payload.standardLabel ?? mappedStandard?.label,
    contentVersion: typeof row.content_version === "string" ? row.content_version : undefined,
    isVisible: true,
    includeInSelfPractice: true,
    imageUrl: payload.imageUrl ?? null,
    hasImage: row.has_image === true,
    hasStimulusImage: row.has_stimulus_image === true,
  };
  return filterRenderableQuestions([question])[0] ?? null;
}

export async function POST(request: Request) {
  const retryCount = Math.max(0, Number.parseInt(request.headers.get("x-bkt-selection-retry") ?? "0", 10) || 0);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = parseBody((await request.json().catch(() => ({}))) as NextQuestionBody);
  if (!body) return NextResponse.json({ error: "A valid ordered standardIds list is required" }, { status: 400 });
  const admin = createSupabaseAdminClient();

  // A student is only ever served from their own school's bank, so the rollout
  // that governs them is the one for that school — a standard enabled elsewhere
  // says nothing about whether this school has an item for every KC.
  const { data: memberRows, error: memberError } = await admin
    .from("school_members")
    .select("school_id")
    .eq("student_user_id", user.id);
  if (memberError) return NextResponse.json({ error: "Unable to load adaptive rollout state" }, { status: 500 });
  const schoolIds = [...new Set((memberRows ?? []).map((row) => String(row.school_id)))];
  if (schoolIds.length === 0) {
    return NextResponse.json({ status: "unavailable", reason: "scope_unavailable" });
  }

  const { data: rolloutRows, error: rolloutError } = await admin
    .from("bkt_standard_rollouts")
    .select("standard_id,status")
    .in("school_id", schoolIds)
    .in("standard_id", body.standardIds)
    .eq("status", "enabled");
  if (rolloutError) return NextResponse.json({ error: "Unable to load adaptive rollout state" }, { status: 500 });
  const enabled = new Set((rolloutRows ?? []).map((row) => String(row.standard_id)));
  const enabledStandards = body.standardIds.filter((standardId) => enabled.has(standardId));
  if (enabledStandards.length !== body.standardIds.length) {
    return NextResponse.json({ status: "unavailable", reason: "scope_unavailable" });
  }

  const [kcResult, masteryResult, rotationResult, selectionHistory] = await Promise.all([
    admin.from("knowledge_components").select("code,standard_id,catalog_order").in("standard_id", enabledStandards).eq("active", true).order("catalog_order"),
    admin.from("student_kc_mastery").select("kc_code,probability,mastered,observation_count").eq("user_id", user.id),
    admin.from("adaptive_rotation_states").select("standard_id,cycle_position,recent_kc_codes,last_question_id,last_served_at,lock_version").eq("user_id", user.id).in("standard_id", enabledStandards),
    admin.from("adaptive_selection_events").select("standard_id,target_kc_code,question_set_id,question_id,created_at").eq("user_id", user.id).in("standard_id", enabledStandards).eq("outcome", "selected").order("created_at", { ascending: false }).limit(500),
  ]);
  if (kcResult.error || masteryResult.error || rotationResult.error || selectionHistory.error) {
    return NextResponse.json({ error: "Unable to load adaptive state" }, { status: 500 });
  }
  const mastery = new Map((masteryResult.data ?? []).map((row) => [String(row.kc_code), row]));
  const lastKc = new Map<string, string | null>();
  const lastQuestionByStandard = new Map<
    string,
    { questionSetId: string | null; questionId: string }
  >();
  for (const row of selectionHistory.data ?? []) {
    const kcCode = typeof row.target_kc_code === "string" ? row.target_kc_code : "";
    if (kcCode && !lastKc.has(kcCode)) lastKc.set(kcCode, String(row.created_at));
    const questionId = typeof row.question_id === "string" ? row.question_id : "";
    const questionSetId =
      typeof row.question_set_id === "string" ? row.question_set_id : null;
    const standardId =
      typeof row.standard_id === "string" ? row.standard_id : "";
    if (questionId && standardId && !lastQuestionByStandard.has(standardId)) {
      lastQuestionByStandard.set(standardId, { questionSetId, questionId });
    }
  }
  const kcCandidates: AdaptiveKcCandidate[] = (kcResult.data ?? []).map((row) => {
    const state = mastery.get(String(row.code));
    return {
      kcCode: String(row.code), standardId: String(row.standard_id), catalogOrder: Number(row.catalog_order),
      probability: Number(state?.probability ?? 0.3), mastered: state?.mastered === true,
      observed: Number(state?.observation_count ?? 0) > 0, lastServedAt: lastKc.get(String(row.code)) ?? null,
    };
  });
  const rotationByStandard = new Map((rotationResult.data ?? []).map((row) => [String(row.standard_id), row]));
  const cyclePosition = new Map(Array.from(rotationByStandard, ([standard, row]) => [standard, Number(row.cycle_position)]));
  const standardLastServed = new Map(Array.from(rotationByStandard, ([standard, row]) => [standard, typeof row.last_served_at === "string" ? row.last_served_at : null]));
  const recentKcCodesByStandard = new Map(
    enabledStandards.map((standard) => {
      const value = rotationByStandard.get(standard)?.recent_kc_codes;
      const recentKcCodes = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
      return [standard, recentKcCodes] as const;
    }),
  );
  const target = orderTargetKcs({ candidates: kcCandidates, standardOrder: enabledStandards, cyclePositionByStandard: cyclePosition, standardLastServedAt: standardLastServed, recentKcCodesByStandard });
  if (!target) {
    const standardId = enabledStandards[0];
    const state = rotationByStandard.get(standardId);
    await admin.rpc("record_adaptive_selection", {
      p_user_id: user.id, p_session_id: body.sessionId, p_standard_id: standardId,
      p_lane: "priority", p_candidate_kc_codes: [], p_target_kc_code: null,
      p_fallback_kc_codes: [], p_question_set_id: null, p_question_id: null,
      p_question_format: null, p_outcome: "complete",
      p_decision_context: { activeKcCount: kcCandidates.length },
      p_expected_version: Number(state?.lock_version ?? 0),
    });
    return NextResponse.json({ status: "complete", reason: "all_mastered" });
  }

  const state = rotationByStandard.get(target.standardId);
  const sessionSeed = body.sessionId ?? body.selectionSeed ?? user.id;
  const requiredFormat = body.selectionMode === "mcq"
    ? "mcq"
    : body.selectionMode === "open-ended"
      ? "saq"
      : body.requiredFormat;
  const formatPasses: Array<"mcq" | "saq" | undefined> = [requiredFormat];
  if (body.selectionMode === "mixed" && requiredFormat) {
    formatPasses.push(requiredFormat === "mcq" ? "saq" : "mcq");
  }
  const loadedByKc = new Map<
    string,
    {
      candidates: AdaptiveQuestionCandidate[];
      questionByKey: Map<string, Question>;
    }
  >();
  let coverageGapKcCodes = [...target.orderedKcCodes];

  for (let formatPassIndex = 0; formatPassIndex < formatPasses.length; formatPassIndex += 1) {
    const format = formatPasses[formatPassIndex];
    const fallbackKcCodes: string[] = [];
    for (const kcCode of target.orderedKcCodes) {
      let loaded = loadedByKc.get(kcCode);
      if (!loaded) {
        const candidateResult = await loadAdaptiveCandidateRows(
          admin,
          user.id,
          target.standardId,
          kcCode,
        );
        if (candidateResult.error) {
          console.error("Unable to load adaptive practice candidates", {
            code: candidateResult.error.code,
            message: candidateResult.error.message,
            standardId: target.standardId,
            targetKcCode: kcCode,
          });
          return NextResponse.json(
            { error: "Unable to load mapped question candidates" },
            { status: 500 },
          );
        }

        const questionByKey = new Map<string, Question>();
        const candidates: AdaptiveQuestionCandidate[] = [];
        for (const row of candidateResult.data) {
          const question = questionFromCandidateRow(row);
          if (!question?.questionSetId) continue;
          const partKcCodes = Array.isArray(row.part_kc_codes)
            ? row.part_kc_codes.filter((code): code is string => typeof code === "string")
            : [];
          if (!partKcCodes.includes(kcCode)) continue;
          const key = `${question.questionSetId}\0${question.id}`;
          questionByKey.set(key, question);
          candidates.push({
            questionId: question.id,
            questionSetId: question.questionSetId,
            format: row.format === "saq" ? "saq" : "mcq",
            standardId: target.standardId,
            targetKcCode: kcCode,
            partKcCodes,
            completedCount: Math.max(0, Number(row.completed_count) || 0),
            lastCompletedAt:
              typeof row.last_completed_at === "string" ? row.last_completed_at : null,
          });
        }
        loaded = { candidates, questionByKey };
        loadedByKc.set(kcCode, loaded);
      }

      const ranked = rankQuestionsForKc(
        loaded.candidates,
        kcCode,
        lastQuestionByStandard.get(target.standardId) ?? null,
        sessionSeed,
        format,
      );
      if (!ranked.length) {
        fallbackKcCodes.push(kcCode);
        continue;
      }
      const selected = ranked[0];
      const question = loaded.questionByKey.get(`${selected.questionSetId}\0${selected.questionId}`);
      if (!question) {
        fallbackKcCodes.push(kcCode);
        continue;
      }
      const context = {
        mastery: Object.fromEntries(kcCandidates.filter((candidate) => target.orderedKcCodes.includes(candidate.kcCode)).map((candidate) => [candidate.kcCode, candidate.probability])),
        rankedQuestionIds: ranked.map((candidate) => candidate.questionId),
        selectedPartKcCodes: selected.partKcCodes,
        selectedCompletedCount: selected.completedCount,
        selectedLastCompletedAt: selected.lastCompletedAt,
        requestedFormat: requiredFormat ?? null,
        formatFallbackUsed: formatPassIndex > 0,
      };
      const { data: recorded, error } = await admin.rpc("record_adaptive_selection", {
        p_user_id: user.id, p_session_id: body.sessionId, p_standard_id: target.standardId,
        p_lane: target.lane, p_candidate_kc_codes: target.orderedKcCodes,
        p_target_kc_code: kcCode, p_fallback_kc_codes: fallbackKcCodes,
        p_question_set_id: selected.questionSetId, p_question_id: selected.questionId,
        p_question_format: selected.format, p_outcome: "selected", p_decision_context: context,
        p_expected_version: Number(state?.lock_version ?? 0),
      });
      if (error) return NextResponse.json({ error: "Unable to record adaptive selection" }, { status: 500 });
      if (!recorded) {
        if (retryCount < 2) {
          return POST(new Request(request.url, {
            method: "POST",
            headers: { "content-type": "application/json", "x-bkt-selection-retry": String(retryCount + 1) },
            body: JSON.stringify(body),
          }));
        }
        return NextResponse.json({ error: "Adaptive state changed; retry the request", retriable: true }, { status: 409 });
      }
      return NextResponse.json({ status: "selected", lane: target.lane, targetKcCode: kcCode, question: { ...question, questionSetId: selected.questionSetId } }, { headers: { "Cache-Control": "no-store" } });
    }
    coverageGapKcCodes = fallbackKcCodes;
  }
  await admin.rpc("record_adaptive_selection", {
    p_user_id: user.id, p_session_id: body.sessionId, p_standard_id: target.standardId,
    p_lane: target.lane, p_candidate_kc_codes: target.orderedKcCodes,
    p_target_kc_code: target.orderedKcCodes[0], p_fallback_kc_codes: coverageGapKcCodes,
    p_question_set_id: null, p_question_id: null, p_question_format: null,
    p_outcome: "coverage_gap", p_decision_context: {}, p_expected_version: Number(state?.lock_version ?? 0),
  });
  return NextResponse.json({ status: "unavailable", reason: "coverage_gap", standardId: target.standardId, kcCodes: coverageGapKcCodes });
}
