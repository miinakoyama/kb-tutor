import { NextResponse } from "next/server";
import { orderTargetKcs, rankQuestionsForKc } from "@/lib/bkt/selection";
import { getQuestionHistory, questionHistoryKey } from "@/lib/bkt/question-history";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchStudentSelfPracticeQuestions } from "@/lib/school-generated-questions";
import { getStandardById } from "@/lib/standards";
import type { AdaptiveKcCandidate, AdaptiveQuestionCandidate } from "@/types/bkt";
import type { Question } from "@/types/question";

interface NextQuestionBody {
  standardIds?: unknown;
  sessionId?: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseBody(value: NextQuestionBody): { standardIds: string[]; sessionId: string | null } | null {
  if (!Array.isArray(value.standardIds)) return null;
  const standardIds = [...new Set(value.standardIds.filter((item): item is string => typeof item === "string" && Boolean(getStandardById(item))))];
  if (!standardIds.length) return null;
  const sessionId = typeof value.sessionId === "string" && UUID_RE.test(value.sessionId) ? value.sessionId : null;
  return { standardIds, sessionId };
}

function latestIso(current: string | null, next: unknown): string | null {
  if (typeof next !== "string") return current;
  if (!current || Date.parse(next) > Date.parse(current)) return next;
  return current;
}

export async function POST(request: Request) {
  const retryCount = Math.max(0, Number.parseInt(request.headers.get("x-bkt-selection-retry") ?? "0", 10) || 0);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = parseBody((await request.json().catch(() => ({}))) as NextQuestionBody);
  if (!body) return NextResponse.json({ error: "A valid ordered standardIds list is required" }, { status: 400 });
  const admin = createSupabaseAdminClient();

  const { data: rolloutRows, error: rolloutError } = await admin
    .from("bkt_standard_rollouts")
    .select("standard_id,status")
    .in("standard_id", body.standardIds)
    .eq("status", "enabled");
  if (rolloutError) return NextResponse.json({ error: "Unable to load adaptive rollout state" }, { status: 500 });
  const enabled = new Set((rolloutRows ?? []).map((row) => String(row.standard_id)));
  const enabledStandards = body.standardIds.filter((standardId) => enabled.has(standardId));
  if (enabledStandards.length !== body.standardIds.length) {
    return NextResponse.json({ status: "unavailable", reason: "scope_unavailable" });
  }

  const [kcResult, masteryResult, rotationResult, selectionHistory, bank] = await Promise.all([
    admin.from("knowledge_components").select("code,standard_id,catalog_order").in("standard_id", enabledStandards).eq("active", true).order("catalog_order"),
    admin.from("student_kc_mastery").select("kc_code,probability,mastered,observation_count").eq("user_id", user.id),
    admin.from("adaptive_rotation_states").select("standard_id,cycle_position,recent_kc_codes,last_question_id,last_served_at,lock_version").eq("user_id", user.id).in("standard_id", enabledStandards),
    admin.from("adaptive_selection_events").select("standard_id,target_kc_code,question_set_id,question_id,created_at").eq("user_id", user.id).in("standard_id", enabledStandards).eq("outcome", "selected").order("created_at", { ascending: false }).limit(500),
    fetchStudentSelfPracticeQuestions(supabase),
  ]);
  if (kcResult.error || masteryResult.error || rotationResult.error || selectionHistory.error) {
    return NextResponse.json({ error: "Unable to load adaptive state" }, { status: 500 });
  }
  const scopedQuestions = bank.questions.filter((question) => question.standardId && enabled.has(question.standardId));
  const questionIds = [...new Set(scopedQuestions.map((question) => question.id))];
  const setIds = [...new Set(scopedQuestions.flatMap((question) => question.questionSetId ? [question.questionSetId] : []))];
  const mappingResult = questionIds.length && setIds.length
    ? await admin.from("question_kc_assignments")
        .select("question_set_id,question_id,part_label,format,standard_id,kc_code")
        .in("question_set_id", setIds).in("question_id", questionIds)
        .in("standard_id", enabledStandards).eq("status", "confirmed").is("valid_to", null)
    : { data: [], error: null };
  if (mappingResult.error) return NextResponse.json({ error: "Unable to load mapped question candidates" }, { status: 500 });
  const attemptResult = questionIds.length
    ? await admin.from("attempts").select("question_set_id,question_id,answered_at").eq("user_id", user.id).in("question_id", questionIds).order("answered_at", { ascending: false })
    : { data: [], error: null };
  const saqAttemptResult = questionIds.length
    ? await admin.from("short_answer_attempts").select("question_set_id,question_id,answered_at").eq("user_id", user.id).in("question_id", questionIds).order("answered_at", { ascending: false })
    : { data: [], error: null };

  const mastery = new Map((masteryResult.data ?? []).map((row) => [String(row.kc_code), row]));
  const lastKc = new Map<string, string | null>();
  const lastQuestion = new Map<string, string | null>();
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
    const historyKey = questionId
      ? questionHistoryKey(questionSetId, questionId)
      : null;
    if (historyKey && !lastQuestion.has(historyKey)) {
      lastQuestion.set(historyKey, String(row.created_at));
    }
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
  const recentKcCodes = enabledStandards.flatMap((standard) => {
    const value = rotationByStandard.get(standard)?.recent_kc_codes;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  });
  const target = orderTargetKcs({ candidates: kcCandidates, standardOrder: enabledStandards, cyclePositionByStandard: cyclePosition, standardLastServedAt: standardLastServed, recentKcCodes });
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

  const mappingsByQuestion = new Map<string, Array<{ kcCode: string; partLabel: string | null; format: "mcq" | "saq" }>>();
  for (const row of mappingResult.data ?? []) {
    const key = `${row.question_set_id}/${row.question_id}`;
    const list = mappingsByQuestion.get(key) ?? [];
    list.push({ kcCode: String(row.kc_code), partLabel: typeof row.part_label === "string" ? row.part_label : null, format: row.format === "saq" ? "saq" : "mcq" });
    mappingsByQuestion.set(key, list);
  }
  const answeredAt = new Map<string, string | null>();
  for (const row of [...(attemptResult.data ?? []), ...(saqAttemptResult.data ?? [])]) {
    const questionId = String(row.question_id);
    const questionSetId =
      typeof row.question_set_id === "string" ? row.question_set_id : null;
    const historyKey = questionHistoryKey(questionSetId, questionId);
    answeredAt.set(
      historyKey,
      latestIso(answeredAt.get(historyKey) ?? null, row.answered_at),
    );
  }
  const questionByKey = new Map<string, Question>();
  const candidates: AdaptiveQuestionCandidate[] = [];
  for (const question of scopedQuestions) {
    if (!question.questionSetId) continue;
    const key = `${question.questionSetId}/${question.id}`;
    const mappings = mappingsByQuestion.get(key) ?? [];
    if (!mappings.length) continue;
    questionByKey.set(key, question);
    const partKcCodes = mappings.map((mapping) => mapping.kcCode);
    const answerHistory = getQuestionHistory(
      answeredAt,
      question.questionSetId,
      question.id,
    );
    const servedHistory = getQuestionHistory(
      lastQuestion,
      question.questionSetId,
      question.id,
    );
    candidates.push({
      questionId: question.id, questionSetId: question.questionSetId,
      format: mappings[0].format, standardId: question.standardId ?? target.standardId,
      targetKcCode: mappings[0].kcCode, partKcCodes,
      answered: answerHistory.found,
      lastAnsweredAt: answerHistory.value ?? null,
      lastServedAt: servedHistory.value ?? null,
    });
  }
  const unmastered = new Set(kcCandidates.filter((candidate) => !candidate.mastered).map((candidate) => candidate.kcCode));
  const state = rotationByStandard.get(target.standardId);
  const fallbackKcCodes: string[] = [];
  for (const kcCode of target.orderedKcCodes) {
    const ranked = rankQuestionsForKc(candidates.filter((candidate) => candidate.standardId === target.standardId), kcCode, unmastered, lastQuestionByStandard.get(target.standardId) ?? null);
    if (!ranked.length) {
      fallbackKcCodes.push(kcCode);
      continue;
    }
    const selected = ranked[0];
    const question = questionByKey.get(`${selected.questionSetId}/${selected.questionId}`);
    if (!question) continue;
    const context = {
      mastery: Object.fromEntries(kcCandidates.filter((candidate) => target.orderedKcCodes.includes(candidate.kcCode)).map((candidate) => [candidate.kcCode, candidate.probability])),
      rankedQuestionIds: ranked.map((candidate) => candidate.questionId),
      selectedPartKcCodes: selected.partKcCodes,
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
  await admin.rpc("record_adaptive_selection", {
    p_user_id: user.id, p_session_id: body.sessionId, p_standard_id: target.standardId,
    p_lane: target.lane, p_candidate_kc_codes: target.orderedKcCodes,
    p_target_kc_code: target.orderedKcCodes[0], p_fallback_kc_codes: fallbackKcCodes,
    p_question_set_id: null, p_question_id: null, p_question_format: null,
    p_outcome: "coverage_gap", p_decision_context: {}, p_expected_version: Number(state?.lock_version ?? 0),
  });
  return NextResponse.json({ status: "unavailable", reason: "coverage_gap", standardId: target.standardId, kcCodes: fallbackKcCodes });
}
