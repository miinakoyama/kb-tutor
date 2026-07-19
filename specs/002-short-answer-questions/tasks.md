# Tasks: Short-Answer (Constructed-Response) Questions

**Input**: Design documents from `/specs/002-short-answer-questions/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, reference-pipeline.md

**Tests**: Included per the project constitution: pure utilities in `src/lib/` require Vitest coverage, and every new role-protected route handler requires authorized + unauthorized path tests with Supabase/LLM mocked via `vi.mock()`. Test files live next to source as `*.test.ts`.

**Organization**: Tasks are grouped by user story. US1 (student answering + feedback) is the MVP; US2 (generation), US3 (settings), US4 (report review) layer on independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4, matching spec.md priorities

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies, reference data, and shared types

- [X] T001 Install `openai` and `@anthropic-ai/sdk` via npm; add `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` rows to `.env.local.example` with server-side-only comments
- [X] T002 Copy reference data from `cocoj1115/mvp4-internal-testing` `main` into `src/data/short-answer/`: `kc_table.csv`, `taxonomy_and_cards.json`, `exemplars.json`, `rubrics.json`, `standards.json`, `gstar/G_star_*.json` (4 files), `kb/kd1_embeddings.json`, `kb/kd2_embeddings.json`, `kb/ke_embeddings.json` — explicitly exclude `study_guide_chunks.json` (research R2)
- [X] T003 [P] Define content types in `src/types/short-answer.ts`: `ShortAnswerItem`, `ShortAnswerPart`, `StimulusAsset` (discriminated union), `HolisticRubric`, `AnnotatedResponse`, `ItemBlueprint`, `GenerationMetadata`, `TaskType`, `PartLabel`, `GradedFeedback` (verdict/segments/modelAnswer/glossaryTerms), `GradingModelConfig` per data-model.md §1

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Migrations, LLM client layer, validators, and route protection that every story builds on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 [P] Migration `supabase/migrations/<ts>_short_answer_attempts.sql`: table per data-model.md §2 (columns, CHECKs, `client_attempt_id` UNIQUE, composite uniqueness, 4 indexes, RLS: self insert/select, teacher select via school join, admin all)
- [X] T005 [P] Migration `supabase/migrations/<ts>_feedback_settings.sql`: table per data-model.md §3 (scope CHECK, `school_id` UNIQUE, partial unique index on `scope='default'`, RLS: no student access, teacher own-school select/update/insert, admin all)
- [X] T006 [P] Migration `supabase/migrations/<ts>_feedback_reports.sql`: table per data-model.md §4 (FK → `short_answer_attempts`, `UNIQUE (student_user_id, attempt_id)`, indexes, RLS: student insert/select own, teacher select/update via school join, admin all)
- [X] T007 [P] Migration `supabase/migrations/<ts>_student_question_notes.sql`: table per data-model.md §5 (`UNIQUE (user_id, question_id)`, `(user_id, updated_at desc)` index, RLS self-only)
- [X] T008 [P] Migration `supabase/migrations/<ts>_user_settings_sa_tour.sql`: add `short_answer_tour_seen_at timestamptz` to `user_settings` (data-model.md §6)
- [X] T009 [P] LLM env getters in `src/lib/llm/env.ts`: `getOpenAIKey()`, `getAnthropicKey()`, `getGeminiKey()` (throws with clear message when missing; the only non-Supabase `process.env` access point per plan Complexity Tracking)
- [X] T010 LLM client in `src/lib/llm/client.ts`: port reference `lib/llm.ts` `chatComplete({ model, temperature, messages, jsonMode, maxTokens })` — OpenAI SDK, Anthropic SDK (system-prompt JSON instruction + `stripJsonFences`), Gemini via OpenAI-compatible baseURL, provider inferred from model prefix; add 60s AbortController timeout (research R1); depends on T001, T009
- [X] T011 [P] Model catalogs in `src/lib/llm/models.ts`: generation models (`claude-sonnet-4-6`, `claude-opus-4-8`, `gpt-5.4`, `gpt-5.4-mini`, `gemini-3.1-flash-lite-preview`), grading catalog + per-method recommended defaults (M1 `claude-opus-4-8`/1, M2 `gpt-5.4`/1, M3 `claude-sonnet-4-6`/0), `findModelById`, labels for UI (research R13)
- [X] T012 [P] Item/blueprint validators in `src/lib/short-answer/item-schema.ts`: all invariants from data-model.md §1 (anchor=core KC, selected_kcs coverage, taxonomy task types, stimulus-type match, rubric sums, annotated responses 0..N, placeholder detection, SVG safety checks: no `<script`/`on*=`/external refs, `standardId` ∈ `STANDARD_DEFINITIONS`)
- [X] T013 [P] Unit tests in `src/lib/short-answer/item-schema.test.ts`: valid item passes; each invariant violation fails (mismatched stimulus type, rubric sum ≠ total, missing score level, placeholder text, unsafe SVG, bad standard id)
- [X] T014 [P] Unit tests in `src/lib/llm/client.test.ts`: provider routing by model prefix, jsonMode request shapes, Anthropic fence-stripping, timeout abort (SDKs mocked via `vi.mock()`)
- [X] T015 Add route protection entries in `middleware.ts`: `/api/short-answer/generate` + `/api/feedback-settings` → teacher/admin; `/api/short-answer/grade` + `/api/feedback-reports` + `/api/student-notes` + `/my-notes` → authenticated (research R12; no new generation page — `/content/mass-production` is already protected)

**Checkpoint**: Foundation ready — user story phases can begin

---

## Phase 3: User Story 1 - Student answers a short-answer question and receives AI feedback (Priority: P1) 🎯 MVP

**Goal**: Full student experience: split-panel UI, 2-attempt loop with Socratic feedback and model-answer reveal, attempt dots + history, highlighting, countdown, completion section (Key Terms + My Notes), feedback reporting (send), spotlight tour, all modes incl. exam deferral.

**Independent Test**: Seed the sample item (T016), log in as a student, complete quickstart.md "Verify: student answering + feedback" steps 1–10 and "Verify: exam mode deferral".

### Grading engine (server)

- [X] T016 [P] [US1] Sample item fixture + seed script: `src/data/short-answer/sample-item.json` (complete valid `ShortAnswerItem`) and `scripts/seed-short-answer-sample.ts` inserting it via `addGeneratedQuestionSet` for local testing
- [X] T017 [P] [US1] Grading shared utilities in `src/lib/short-answer/grading/common.ts`: `normalizeScore`, `normalizeFeedback` (preferred-keys extraction), shared prompt-context types, feedback→`GradedFeedback` segment mapper (verdict phrase selection incl. "Good try!"/"Good start!") per reference-pipeline.md common spec
- [X] T018 [P] [US1] Method 1 KB retrieval in `src/lib/short-answer/grading/retrieval.ts`: port reference `lib/retrieval.ts` (OpenAI embeddings, KD1/KD2 cosine top-k, KE top-5 + 0.6·cosine+0.4·wordOverlap rerank, `\n---\n` join) reading `src/data/short-answer/kb/`; graceful null fallback when collections missing
- [X] T019 [P] [US1] Method 3 boundary examples in `src/lib/short-answer/grading/boundary-examples.ts`: port reference pairs keyed by questionId+part; `formatBoundaryExamples()` with `(No boundary examples available for this part.)` fallback
- [X] T020 [US1] Method 1 in `src/lib/short-answer/grading/method1.ts`: port reference `lib/methods/method1.ts` (GradeOpt adaptation rules from `src/data/short-answer/gstar/`, KB context, priorGaps, full system/user prompts and output JSON per reference-pipeline.md); depends on T017, T018
- [X] T021 [P] [US1] Method 2 in `src/lib/short-answer/grading/method2.ts`: port two-stage scoring→feedback with both prompt sets, failure types, token/latency aggregation per reference-pipeline.md; depends on T017
- [X] T022 [US1] Method 3 in `src/lib/short-answer/grading/method3.ts`: port error-analysis-first prompt, output order, feedback fallbacks, confidence normalization per reference-pipeline.md; depends on T017, T019
- [X] T023 [P] [US1] Unit tests `src/lib/short-answer/grading/method1.test.ts`, `method2.test.ts`, `method3.test.ts`: mocked `chatComplete`; score normalization/clamping, feedback extraction from nested/malformed JSON, Method 2 two-call flow, Method 3 fallback strings + confidence default "medium"
- [X] T024 [P] [US1] Settings resolution in `src/lib/short-answer/settings.ts`: effective config = school row → default row → hardcoded (M2/`gpt-5.4`/1); multi-school = most recent membership; per-method recommended defaults helper (research R6) + tests in `src/lib/short-answer/settings.test.ts`
- [X] T025 [P] [US1] Attempt persistence in `src/lib/short-answer/attempts.ts`: insert `short_answer_attempts` row; on part resolution upsert summary row into `attempts` (`selected_option_id='short-answer'`, `onConflict: client_attempt_id`) (research R5)
- [X] T026 [US1] Grade route `src/app/api/short-answer/grade/route.ts` per contracts/short-answer-grade.md: `getUser()` re-verify; item resolution (assignment snapshot or `generated_questions`); server-side config resolution; attempt-cap 409 + idempotent replay via `clientAttemptId`; empty-response short-circuit (`method='none'`); Method 1/2/3 dispatch with one retry; persist-then-respond; 502 with nothing persisted on failure; depends on T020–T025
- [X] T027 [US1] Route tests `src/app/api/short-answer/grade/route.test.ts`: unauthorized 401; happy path per method; empty submission (no LLM call, attempt recorded); attempt-cap 409; idempotent replay 200; LLM failure 502 with no row written; closing feedback plus model answer on a resolving incorrect final attempt

### Student UI (components in `src/components/short-answer/`)

- [X] T028 [P] [US1] `StimulusPanel.tsx`: stem + typed stimulus rendering (markdown table→React table, Recharts grayscale line/bar, scenario text, illustration placeholder, diagram via sanitized `<img src="data:image/svg+xml,...">`), separate title, "Select to highlight" hint (research R10)
- [X] T029 [P] [US1] `HighlightLayer.tsx`: always-on selection highlighting over stimulus/cards/feedback/completion; `Range.surroundContents` with `extractContents`+wrap fallback; click-to-unwrap + `normalize()`; textarea exclusion (FR-010)
- [X] T030 [P] [US1] `FeedbackBlock.tsx`: binary verdict row (glyph + phrase + "N try left" pill), labeled segments with `<strong>` vocabulary, glossary chips, plain-text model answer (final incorrect only), unlock countdown bar (3→0, auto-advance callback) (FR-007/008, FR-005)
- [X] T031 [P] [US1] `PartCard.tsx`: A/B/C badge with locked/active/done states, prompt, textarea with char counter + maxLength, Check disabled only when empty + disabled during grading, attempt dots (gray→green/red, clickable when scored, aria-labels "Attempt 1 — incorrect"), Report button, "Finish Part X first" note (FR-003/004/006)
- [X] T032 [P] [US1] `AttemptHistoryModal.tsx`: single-attempt view (outcome pill, "You wrote" quoted text, feedback segments + model answer if present), keyboard/backdrop dismiss (FR-006)
- [X] T033 [P] [US1] `GlossaryPopup.tsx`: near-cursor term+definition tooltip, dismiss on next click (FR-009)
- [X] T034 [P] [US1] `CompletionSection.tsx`: Key Terms list card, "My Notes (optional)" lined textarea with debounced blur autosave + "Saved" fade via browser Supabase upsert to `student_question_notes` (contracts/student-notes.md), Continue button (FR-014)
- [X] T035 [P] [US1] `ReportFeedbackModal.tsx`: single "Report feedback" modal with a Part/Attempt dropdown, selected feedback/model-answer preview, optional note, and Cancel/Send; POSTs the exact attempt to `/api/feedback-reports` and marks that attempt "Reported" (FR-016)
- [X] T036 [P] [US1] `SpotlightTour.tsx`: 4-step spotlight over real elements (How-to-use, live demo highlight word with wrap/unwrap, Report button, attempt dots), viewport-aware tooltip placement + clamp, step dots/skip/back/next, persists `user_settings.short_answer_tour_seen_at`, reopenable via "How to use" (FR-018)
- [X] T037 [US1] `ShortAnswerQuestionView.tsx`: split-panel container wiring T028–T036 — part lifecycle state machine (locked→active→submitting→retry/resolved→countdown per data-model.md state transitions), grade API calls, sequential unlock + smooth scroll, A/B/C stepper + bottom-bar status text, 2-part item support, retriable-error toast on 502 without consuming attempt

### Mode & data integration

- [X] T038 [US1] Load short-answer items in `src/hooks/useQuestions.ts` and question payload guards: accept `questionType: "open-ended"` payloads with `shortAnswer` field (sentinel MCQ fields per research R8), validate via `item-schema.ts` on load
- [X] T039 [US1] Branch `src/components/modes/AdaptivePracticeMode.tsx` (practice/review/assignment): render `ShortAnswerQuestionView` for open-ended items, MCQ path untouched; per-part persistence via grade API; question-level progress + assignment completion POST fire when all parts resolve
- [X] T040 [US1] Exam mode in `src/components/modes/ExamMode.tsx`: open-ended items render single-attempt silent panels (no feedback/dots/countdown/completion), responses held locally; on exam submit grade each part via API (`mode:'exam'`, attempt 1); exam review shows per-part scores, feedback, model answers for incorrect parts (FR-037)
- [X] T041 [P] [US1] Student report POST handler in `src/app/api/feedback-reports/route.ts` (POST only in this story): own-attempt validation, 409 duplicate, 201 per contracts/feedback-reports.md + tests in `src/app/api/feedback-reports/route.test.ts` (unauthorized, foreign attempt 403, duplicate 409)
- [X] T042 [P] [US1] Notes list API `src/app/api/student-notes/route.ts` (GET, caller-scoped, question previews server-joined, deleted-question fallback per contracts/student-notes.md) + tests in `src/app/api/student-notes/route.test.ts`
- [X] T043 [US1] `/my-notes` page in `src/app/my-notes/page.tsx`: newest-first list (topic, preview, date), note detail beside its question with editable autosave; add "My Notes" item to `STUDENT_SECTION` in `src/components/Sidebar.tsx` (FR-015)

**Checkpoint**: US1 fully functional — MVP demoable with the seeded sample item across practice, review, assignment, and exam modes

---

## Phase 4: User Story 2 - Teacher or admin generates short-answer questions with AI (Priority: P2)

**Goal**: Method2 blueprint→item no-RAG generation (one item per HTTP call; two LLM calls inside each) with model selection, validation/retry, integrated into the existing bulk generation screen with per-type counts ("MCQ n + short-answer m"), mixed-set save, and review/delete on the set detail page (same flow as MCQ today).

**Independent Test**: quickstart.md "Verify: generation" — as teacher and as admin, generate 3 MCQs + 2 short-answer items for `3.1.9-12.A` in one run, confirm valid items + one mixed set whose detail page renders both types and supports per-question delete; confirm invalid output retries, 502 after budget, and that one failed item doesn't discard the rest; confirm short-answer count 0 matches today's MCQ-only behavior.

- [X] T044 [P] [US2] Reference data loaders in `src/lib/short-answer/generation/data.ts`: port reference `lib/aig/data.ts` CSV parser + cached loaders for KCs/taxonomy/cards/exemplars/rubrics/standards from `src/data/short-answer/`; card selection by KC-vocabulary overlap; no study-guide loader exists
- [X] T045 [P] [US2] Generation prompts in `src/lib/short-answer/generation/prompts.ts`: blueprint + item prompts (TELeR L3 directives, schemas, exemplars, rubric anchors, stimulus rules) per reference-pipeline.md Part 1, versioned in repo (constitution IV)
- [X] T046 [US2] Pipeline in `src/lib/short-answer/generation/pipeline.ts`: input resolution (auto KC/stimulus selection, never "none"), no-RAG context assembly (`studyGuideChunks=[]`, grounding flags), stage 1 blueprint + validate + retry ≤3, stage 2 item + validate (T012) + retry ≤3, output `{blueprint, item, grounding, metadata: method2_blueprint_no_rag_l3}`; depends on T044, T045
- [X] T047 [P] [US2] Pipeline tests in `src/lib/short-answer/generation/pipeline.test.ts`: mocked `chatComplete`; auto-selection validity, retry-on-invalid then success, budget exhaustion throws, grounding always reports study_guide empty, stimulus-type propagation
- [X] T048 [US2] Generate route `src/app/api/short-answer/generate/route.ts` per contracts/short-answer-generate.md: `getUser()` + `profiles.role` teacher/admin check, request validation against catalogs/`STANDARD_DEFINITIONS`, 502 `{stage, retriable}` on budget exhaustion; depends on T046
- [X] T049 [US2] Route tests `src/app/api/short-answer/generate/route.test.ts`: 401 unauthenticated, 403 student, 400 unknown standard/model/stimulus, 200 teacher + admin, 502 pipeline failure
- [X] T050 [US2] Extend `src/app/content/mass-production/page.tsx` with per-type counts: an "MCQ count / Short-answer count" pair (either may be 0; short-answer counts distributed across selected standards like MCQ counts), a collapsed short-answer advanced options section (pinned KC, stimulus type, model + temperature from catalog, all Auto by default). Run orchestration: keep the existing single `/api/generate-questions` call for MCQs untouched, call `/api/short-answer/generate` once per short-answer item (sequential or limited concurrency; each HTTP call = blueprint + item LLM calls server-side) with per-item progress and failure isolation (failed items are reported; successful ones are kept). On completion, one `addGeneratedQuestionSet` save merging both types into a single set, then redirect to the set detail page — same flow as today, no pre-save preview. Short-answer count 0 must be behavior-identical to the current screen
- [X] T050b [US2] Extend the set detail page `src/app/content/questions/[setId]/page.tsx` to render short-answer items: full item view (stimulus via `StimulusPanel`, Parts A/B/C prompts, holistic + per-part rubrics, annotated responses, key terms, generation metadata) alongside existing MCQ cards; existing per-question delete works for short-answer items (this is where unwanted generated items are discarded); editing short-answer content is out of scope (view + delete only)

**Checkpoint**: US1 + US2 independently functional — generated items flow into US1's answering experience

---

## Phase 5: User Story 3 - Teacher or admin configures the feedback method and model (Priority: P3)

**Goal**: Per-school method/model/temperature editor with recommended defaults auto-fill and system default (admin).

**Independent Test**: quickstart.md "Verify: settings" steps 1–3 — change one school to Method 3, verify next attempt row records method 3 + default model; other school unaffected; student gets 403 on the API.

- [X] T051 [US3] Settings route `src/app/api/feedback-settings/route.ts` per contracts/feedback-settings.md: GET (methods + catalog + default + caller-scoped schools with inherited flag), PUT (upsert school/default with validation, `reset` support, teacher school-membership check, admin-only default)
- [X] T052 [US3] Route tests `src/app/api/feedback-settings/route.test.ts`: 401/403 student, teacher foreign-school 403, teacher default-scope 403, admin default PUT 200, invalid model/temperature 400, reset reverts to inherited
- [X] T053 [US3] Settings card in `src/components/short-answer/FeedbackSettingsCard.tsx` mounted in `src/app/teacher-dashboard/page.tsx`: per-school method selector with recommended model/temp auto-fill on method switch (FR-025), override fields, inherited-from-default state, admin-only default editor

**Checkpoint**: US3 functional — grading (US1) picks up school settings on the next submission with no student action

---

## Phase 6: User Story 4 - Teacher reviews student reports of AI feedback (Priority: P4)

**Goal**: Teacher-dashboard list of feedback reports with full context and reviewed workflow.

**Independent Test**: quickstart.md "Verify: reports" step 4 — student report (from US1) appears for the school's teacher with answer+feedback context, mark reviewed removes it from unreviewed, foreign teachers see nothing, admin sees all.

- [X] T054 [US4] Extend `src/app/api/feedback-reports/route.ts` with GET (status/school filters, pagination, teacher school-scoping, attempt + student + question-preview join) and PATCH (`reviewed` toggle sets `reviewed_at`/`reviewed_by`) per contracts/feedback-reports.md
- [X] T055 [US4] Extend `src/app/api/feedback-reports/route.test.ts`: teacher sees only own-school reports, admin sees all, PATCH review/unreview, 404 unknown report, student GET 403
- [X] T056 [US4] Reports section in `src/components/short-answer/FeedbackReportsSection.tsx` mounted in `src/app/teacher-dashboard/page.tsx`: unreviewed/reviewed/all tabs, report rows (student, question/part, time, note), expandable context (submitted answer, AI feedback, method/model/confidence), mark-reviewed action

**Checkpoint**: All four user stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T057 [P] Accessibility pass over `src/components/short-answer/`: WCAG 2.1 AA contrast on verdict colors, keyboard navigation + focus traps in modals/tour, aria-live for feedback arrival and countdown, 360px layout check (constitution II)
- [X] T058 [P] English-only + design-consistency sweep of all new UI strings and components against the `/assignments` page style (spec FR-002): frosted-glass card tokens (`--assignment-glass-bg*`, `--assignment-card-shadow`, `--assignment-elevated-shadow`), `rounded-2xl` cards, pill-shaped controls, uppercase muted section headings, green/forest + error tokens from `src/app/globals.css` (constitution I)
- [X] T059 Run `npm run lint` and `npm test`; fix all failures introduced by this feature
- [X] T060 Execute quickstart.md end-to-end (all four "Verify" sections) against a local dev environment with real API keys; record results in the PR description
- [X] T061 [P] Write the capacity note for the PR: LLM calls per submission by method, expected classroom-burst concurrency, timeout/retry behavior (constitution III); include the Principle V third-party data justification from plan.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies
- **Phase 2 (Foundational)**: T010 needs T001+T009; T013/T014 need T012/T010; rest parallel after Phase 1 — BLOCKS all stories
- **Phase 3 (US1)**: needs Phase 2. Internal: T020–T022 need T017(+T018/T019); T026 needs T020–T025; T027 needs T026; T037 needs T028–T036; T039/T040 need T037+T038; T043 needs T042
- **Phase 4 (US2)**: needs Phase 2 (+ `StimulusPanel` T028 for the set-detail rendering in T050b). T046 needs T044+T045; T048 needs T046; T050 needs T048; T050b needs T028+T038
- **Phase 5 (US3)**: needs Phase 2 + T024 (resolution lib). Grading integration already reads settings, so US3 is UI/API only
- **Phase 6 (US4)**: needs T041 (reports table usage from US1) for end-to-end value; API/UI tasks depend only on Phase 2
- **Phase 7 (Polish)**: after desired stories complete

### User Story Dependencies

- **US1 (P1)**: independent MVP (uses seeded sample item, not generation)
- **US2 (P2)**: independent of US1 for generation/preview/save; full loop (student answers a generated item) uses US1
- **US3 (P3)**: independent; observable effect requires US1 attempts
- **US4 (P4)**: consumes reports created in US1; review surface itself is independent

### Parallel Opportunities

- Phase 2: T004–T008 (migrations), T009, T011–T014 largely parallel
- US1: grading tasks T017–T019, T021 and UI tasks T028–T036 are parallel tracks (server vs components); T016/T024/T025/T041/T042 parallel
- US2 can start (T044/T045/T047) while US1 UI is in progress, by a second developer
- US3/US4 are small and parallelizable after Phase 2

## Parallel Example: User Story 1

```text
# Track A (server): T017, T018, T019 in parallel → T020, T021, T022 → T026 → T027
# Track B (UI):     T028, T029, T030, T031, T032, T033, T034, T035, T036 in parallel → T037
# Track C (data):   T016, T024, T025, T041, T042 in parallel
# Merge:            T038 → T039, T040 → T043
```

## Implementation Strategy

**MVP first**: Phases 1–3 only, validated with the seeded sample item (T016) — delivers the complete student experience with default feedback config (Method 2). Stop, validate against quickstart.md, demo.

**Incremental delivery**: +US2 (bank population) → +US3 (method steering) → +US4 (report review) → Polish. Each checkpoint is independently testable per the criteria above; existing MCQ flows must stay green (`npm test`) at every checkpoint (SC-007).

## Notes

- Grading/generation prompts must match `reference-pipeline.md` verbatim where specified — do not "improve" prompt wording during porting (method comparability depends on it)
- All new UI text in English; styling follows the `/assignments` page design system (frosted-glass cards, `rounded-2xl`, pill controls, green/forest palette via existing tokens), not the mockups' palette
- Never expose method/model/temperature or LLM keys to student clients; grade route resolves config server-side
- Commit after each task or logical group
