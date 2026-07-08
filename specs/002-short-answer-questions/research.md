# Research: Short-Answer (Constructed-Response) Questions

**Feature**: `002-short-answer-questions` | **Date**: 2026-07-08

All Technical Context unknowns resolved. Reference repo (`cocoj1115/mvp4-internal-testing`) was cloned and inspected directly; kb-tutor internals were audited (types, storage, modes, middleware, settings, dashboard, nav, deps).

---

## R1. LLM client layer

**Decision**: Port the reference `lib/llm.ts` almost verbatim to `src/lib/llm/client.ts`: `chatComplete({ model, temperature, messages, jsonMode, maxTokens })` using the `openai` SDK for OpenAI, `@anthropic-ai/sdk` for Claude (JSON-fence stripping + system-prompt JSON instruction), and the `openai` SDK pointed at Gemini's OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/`) for Google. Provider inferred from model-ID prefix (`claude-` / `gemini-` / else OpenAI). Add a 60s `AbortController` timeout per call (constitution III).

**Rationale**: This exact code is proven in the reference project across all three methods and both pipelines; the Gemini-via-OpenAI-compat trick means one request shape (`response_format: json_object`) covers all providers. Keeping `callLlm` semantics identical minimizes porting bugs against `reference-pipeline.md`.

**Alternatives considered**: (a) Vercel AI SDK — cleaner multi-provider abstraction but rewrites every prompt/parse path and deviates from the reference implementation we must match; (b) extending existing `src/lib/gemini.ts` — it is MCQ-generation-specific (`@google/generative-ai`, model fallback chain) and single-provider; leave it untouched.

**Env vars**: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (new, server-only), existing `GEMINI_API_KEY`. Accessed via getters in `src/lib/llm/env.ts` (see Complexity Tracking).

## R2. Reference data files — source and placement

**Decision**: Copy from the reference repo `main` branch into `src/data/short-answer/`: `kc_table.csv` (24KB), `taxonomy_and_cards.json` (24KB), `exemplars.json` (44KB), `rubrics.json` (24KB), `standards.json` (8KB), `data/gstar/G_star_*.json` (28KB, Method 1 GradeOpt adaptation rules for 4 standards), `data/kb/{kd1,kd2,ke}_embeddings.json` (1.2MB, Method 1 RAG). Do NOT copy `study_guide_chunks.json` (152KB) — the no-RAG variant must never load it (spec FR-030). Loaders use `fs.readFileSync` + module-level caches (server-only), ported from reference `lib/aig/data.ts`.

**Rationale**: All files verified present and small (~1.4MB total). Bundling in-repo satisfies FR-038, keeps generation deterministic, and needs no new storage infra. `data/kb` embeddings ship so Method 1 works out of the box; reference `retrieveFromKB` falls back to `null` gracefully if a collection is missing.

**Alternatives considered**: Supabase storage/tables for reference data — adds migration + fetch latency + cache complexity for read-only files that change with the reference project, not with app data. User confirmed no manual file drop-off needed; repo is public and clonable.

## R3. Grading methods port

**Decision**: Port `lib/methods/method{1,2,3}.ts` (312/288/368 lines) and `lib/retrieval.ts` from the reference repo into `src/lib/short-answer/grading/`, preserving prompts, output schemas, `normalizeScore`, preferred-key feedback extraction, and fallbacks exactly as specified in `reference-pipeline.md`. Method 1's `retrieveFromKB` reads `src/data/short-answer/kb/` (path adapted per the reference's own porting note). Method 3 boundary examples: port the reference's hardcoded pairs keyed by question ID + part; generated items without boundary examples get the documented `(No boundary examples available for this part.)` branch. Embeddings for Method 1 retrieval use OpenAI `text-embedding-3-small` (same as reference `lib/retrieval.ts`).

**Rationale**: The user's requirement is fidelity to the three existing methods so teachers can compare them; verbatim porting with path/env adjustments is the lowest-risk way to preserve behavior.

**Alternatives considered**: Reimplementing from the prose spec alone — risks subtle prompt drift that would invalidate method comparison.

## R4. Grading API design

**Decision**: Single `POST /api/short-answer/grade` route handler. Request: `{ questionId, questionSetId?, assignmentId?, partLabel, studentResponse, attemptNumber, priorGaps?, mode }`. The server (not the client) resolves: the item + part (from `generated_questions` payload or assignment snapshot), the effective feedback config (school setting → system default, per R6), and dispatches to Method 1/2/3 per `reference-pipeline.md`'s dispatch block. Empty responses short-circuit server-side (score 0, fixed message, no LLM call). Response: `{ score, maxScore, correct, feedback, diagnosedGap?, confidence?, attemptId }`. The handler persists the attempt row (R5) before responding; on LLM failure after one retry it returns 502 with a retriable error and persists nothing (FR-023: attempt not consumed). Auth: `supabase.auth.getUser()` + any authenticated role; students can only grade for themselves.

**Rationale**: Server-side config resolution enforces FR-027 (students never see method/model config) and guarantees FR-022 metrics capture on every graded attempt. Matching the reference `POST /api/grade` contract keeps method dispatch identical.

**Alternatives considered**: Client-supplied `method`/`modelConfig` (reference behavior) — rejected: it's an internal-testing affordance that would let students tamper with grading config.

## R5. Attempt persistence

**Decision**: New table `short_answer_attempts` (see data-model.md) instead of extending `attempts`. Columns cover: user/question/part/attempt-number identity (+ unique `client_attempt_id`), response text, score/max/correct, feedback JSONB (verdict, segments, model answer, glossary terms), diagnosed gap, confidence, method/model/temperature, token count, latency, mode, assignment id, timestamps. Additionally, one summary row per resolved part is written to the existing `attempts` table (`selected_option_id = "short-answer"`, `is_correct` = full credit) so existing analytics/progress/assignment-completion flows count short-answer work without modification.

**Rationale**: `attempts.selected_option_id` is `NOT NULL` and the whole analytics stack assumes option-based MCQ rows; free-text + AI-metadata columns belong in a purpose-built table (FR-022 requires method/model/metrics per attempt). The dual-write summary row is the cheapest way to satisfy SC-007 (no regression) and FR-012 (consistent with MCQ history) without touching `buildDashboardResponse`.

**Alternatives considered**: (a) Widening `attempts` with nullable columns — pollutes a hot analytics table with LLM metadata and requires auditing every consumer of `selected_option_id`; (b) storing attempts only client-side like drafts — violates FR-012/SC-005.

## R6. Feedback configuration storage & resolution

**Decision**: New table `feedback_settings` with `scope` (`school` | `default`), nullable `school_id` (unique per school; single row where `scope='default'`), `method` (`1`|`2`|`3`), `model_id`, `temperature`, audit columns. Effective config resolution (in `src/lib/short-answer/settings.ts`): student's school setting → system default row → hardcoded fallback (Method 2 + its recommended model). Per-method recommended defaults ported from reference `lib/grading-models.ts`: Method 1 → `claude-opus-4-8` temp 1, Method 2 → `gpt-5.4` temp 1, Method 3 → `claude-sonnet-4-6` temp 0. `GET/PUT /api/feedback-settings` (teacher: own schools; admin: any school + default), validated in-handler against the model catalog. Students with multiple school memberships: use the most recently joined school's setting (deterministic; documented in contract).

**Rationale**: Matches the spec's school-scope decision; a single table with a `default` scope row avoids a second table; the reference repo already defines the exact default model IDs.

**Alternatives considered**: Columns on `schools` (pattern used for `keystone_exam_date`) — workable but leaves no room for the system-default row and mixes AI config into a roster table; `user_settings` — wrong scope (per-user).

## R7. Generation pipeline & API

**Decision**: Port `lib/aig/pipeline.ts` (blueprint generation → validation → item generation → validation, retry-on-invalid with budget 3 per stage) restricted to the no-RAG Method2 path: `studyGuideChunks = []`, no embedding retrieval, card selection by KC-vocabulary overlap. `POST /api/short-answer/generate` (teacher/admin verified in-handler) generates **one item per call**: `{ standardCode, fixedCoreKC?, stimulusType?, modelId, temperature? }` → `{ blueprint, item, grounding, metadata }` with `metadata.method = "method2_blueprint_no_rag_l3"` (label kept per spec assumption).

**Generation UI (clarified with user)**: no separate page. The existing bulk generation screen (`/content/mass-production`) is extended with per-type counts ("MCQ n + short-answer m", either may be 0; short-answer counts distributed across selected standards like MCQ counts). The client orchestrates the run: one existing `/api/generate-questions` call for the MCQs (pipeline untouched) plus m sequential/limited-concurrency calls to `/api/short-answer/generate` (per-item progress, per-item retry isolation — one failed item never discards the rest, FR-036). Note each such HTTP call wraps **two LLM calls** (blueprint + item), more with validation retries. Short-answer advanced options (pinned KC, stimulus type, model, temperature) live in a collapsed section with auto defaults; model selection applies to short-answer only. **Review flow matches MCQ exactly (user decision)**: no pre-save preview — the run saves all successful output via one `addGeneratedQuestionSet` into a single mixed set (R8) and redirects to the set detail page (`/content/questions/{setId}`), which is extended to render short-answer items in full and reuses the existing per-question delete for discarding unwanted items. Generation models: catalog of 5 (`claude-sonnet-4-6`, `claude-opus-4-8`, `gpt-5.4`, `gpt-5.4-mini`, `gemini-3.1-flash-lite-preview`) in `src/lib/llm/models.ts`.

**Rationale**: The only required short-answer input is the standard (KC/stimulus auto-select), so the inputs match the MCQ screen; the user wants mixed sets created in one run. Client-side orchestration of single-item calls keeps each HTTP request within comfortable timeout bounds and makes batch partial-success trivial. Reusing the existing question-set storage means assignment/set-linking flows work with zero changes to those APIs.

**Alternatives considered**: (a) A separate `/content/short-answer` page — rejected after clarification: it would force two runs and two sets to build a mixed set; (b) a batch generate endpoint (`count: m`) — one long request risks timeouts and loses per-item progress/partial success; (c) a new generation route inside `/api/generate-questions` — that route is public in middleware and hard-wired to 4-option MCQ validation; separating avoids destabilizing it and lets us enforce teacher/admin auth properly; (d) a pre-save keep/discard preview step — rejected: current MCQ generation saves immediately and reviews on the set detail page, and the user chose to keep that flow consistent.

**Explicitly deferred (user decision)**: MCQ KC assignment and refactoring MCQ generation to one-call-per-question are out of scope; the per-type generator split keeps that future swap isolated.

## R8. Item content model (storage shape)

**Decision**: Short-answer items are stored as `generated_questions.payload` JSONB with `questionType: "open-ended"` (already in `QuestionType`) plus a new `shortAnswer` field holding the generated-item schema from `reference-pipeline.md` (stem, stimulus_asset, parts with task types/max scores/scoring guidance, scoring_rubric, part_rubrics, annotated_responses, key terms, blueprint + generation metadata). A new `src/types/short-answer.ts` defines these types; `src/lib/short-answer/item-schema.ts` provides runtime validators used by both the generation route (FR-034) and load-time guards. Legacy MCQ fields (`options`, `correctOptionId`) are filled with sentinel empties for backward type-compatibility, and `useQuestions`/mode components branch on `questionType`.

**Rationale**: `QuestionType = "open-ended"` and JSONB payload storage already exist; no migration needed for content. Sentinel MCQ fields keep the existing `Question` interface untouched (avoiding a sweeping refactor of every consumer) while the runtime branch is a single discriminator check.

**Alternatives considered**: Restructuring `Question` into a discriminated union — cleaner long-term but touches dozens of files and risks MCQ regressions (SC-007); deferred as future refactor.

## R9. Student UI integration with existing modes

**Decision**: New `ShortAnswerQuestionView` component renders the full split-panel experience and is mounted from within `AdaptivePracticeMode` (practice/review/assignment) and `ExamMode` when `question.questionType === "open-ended"`; MCQ rendering paths are untouched. Practice flow state (per-part attempts, unlock, countdown) lives in the view; each submission calls the grade API and persists immediately (matching MCQ's per-attempt `saveAnswer`). Exam mode renders the same panels in single-attempt silent mode: responses stored locally during the exam, then graded via the grade API (mode `exam`) at submission, results shown in exam review. Highlighting is a self-contained `HighlightLayer` using `Range.surroundContents` with `extractContents` fallback and click-to-unwrap (per spec), session-scoped. Tour-seen flag: `user_settings.short_answer_tour_seen_at` (same pattern as `onboarding_completed_at`).

**Rationale**: Mounting inside existing modes preserves session chrome (progress bar, navigation, assignment completion POST) and satisfies FR-037 without forking session logic.

**Alternatives considered**: A dedicated route/page for short-answer sessions — would duplicate assignment completion, progress, and navigation logic and break mixed MCQ+short-answer sets (spec edge case).

## R10. Stimulus rendering (safety)

**Decision**: `StimulusPanel` renders by type: `table_markdown` → parsed to a React table (no raw HTML); `chart_data` → Recharts (already a dependency) with grayscale styling; `scenario_text` → plain text; `illustration_prompt` → placeholder card (downstream image generation out of scope); `diagram_spec` SVG → validated server-side at generation time (reject `<script`, event handlers, external refs — validator ported from the app's existing SVG handling plus reference rules) and rendered client-side via sanitized `<img src="data:image/svg+xml,...">`, never `dangerouslySetInnerHTML`.

**Rationale**: Constitution II/technical standards forbid `dangerouslySetInnerHTML`; an `<img>` data-URI cannot execute scripts, giving defense-in-depth on top of generation-time validation (FR-035).

**Alternatives considered**: DOMPurify + inline SVG — adds a dependency and still injects markup; `<img>` loses text selection inside the diagram, which is acceptable (highlighting targets prose, not diagram internals).

## R11. Reports, notes, and teacher dashboard integration

**Decision**: `feedback_reports` table + `POST /api/feedback-reports` (student, own attempts only) and `GET/PATCH /api/feedback-reports` (teacher scoped via `school_members`/`school_teachers` join; admin unscoped) with `reviewed_at` for the reviewed flow. Teacher dashboard gets a "Feedback Reports" section plus a "Short-Answer Feedback Settings" card (per-school method/model/temperature editor) — both within `teacher-dashboard` where thresholds/settings already live. `student_question_notes` table (`user_id`, `question_id` unique pair, `note_text`, timestamps) with RLS self-access; written via browser Supabase client (same pattern as `user_settings` libs), listed via `GET /api/student-notes` (joins question payloads server-side for previews); `/my-notes` page + `Sidebar.tsx` `STUDENT_SECTION` entry.

**Rationale**: Reuses established patterns (RLS self-write like bookmarks/user_settings; teacher scoping like `resolveTeacherRoster`); dashboard placement matches where teachers already manage per-school configuration.

**Alternatives considered**: Notes in `localStorage` — fails FR-015 (cross-device review); a separate reports page — dashboard section is fewer clicks (constitution II discoverability).

## R12. Middleware & route protection map

**Decision**: In-handler auth is primary (constitution V). Middleware role map additions: `/api/short-answer/generate` and `/api/feedback-settings` → teacher/admin; `/api/short-answer/grade`, `/api/feedback-reports`, `/api/student-notes` → authenticated; `/my-notes` page → authenticated. No new generation page (the extended `/content/mass-production` is already teacher/admin-protected). Nothing new is public.

**Rationale**: Defense in depth; mirrors existing `/api/teacher` handling. Note the existing `/api/generate-questions` public-route pattern is deliberately NOT copied.

## R13. Model identifiers

**Decision**: Model catalog uses the reference repo's live IDs — grading defaults `claude-opus-4-8` (M1), `gpt-5.4` (M2), `claude-sonnet-4-6` (M3); generation options `claude-sonnet-4-6`, `claude-opus-4-8`, `gpt-5.4`, `gpt-5.4-mini`, `gemini-3.1-flash-lite-preview`. Stored settings reference catalog IDs (validated on write), so future model swaps are catalog edits + at most a settings backfill.

**Rationale**: These IDs are verified working in the reference project against the same providers ("Gemini 3.1 flush lite" in the request = `gemini-3.1-flash-lite-preview`, already used by kb-tutor's MCQ pipeline; "GPT 5.4 mini" = `gpt-5.4-mini`).
