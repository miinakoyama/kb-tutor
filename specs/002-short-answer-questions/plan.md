# Implementation Plan: Short-Answer (Constructed-Response) Questions

**Branch**: `002-short-answer-questions` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-short-answer-questions/spec.md`

## Summary

Add a second question type — Keystone Biology constructed-response ("short answer") items with Parts A/B/C — to the existing MCQ-only app. Three workstreams:

1. **Student answering UI**: split-panel screen (stimulus reading panel + part cards), 2 attempts per part with Socratic feedback then model-answer reveal, attempt dots + history modal, selection-based highlighting, unlock countdown, completion section (Key Terms + My Notes), feedback reporting, and a first-time spotlight tour. Available in all modes; exam mode is single-attempt with deferred grading.
2. **AI item generation**: port the reference project's Method2 blueprint→item pipeline (no study-guide RAG variant, label `method2_blueprint_no_rag_l3`) with structural validation/retry and model selection across OpenAI/Anthropic/Google. Generation is integrated into the existing bulk generation screen with per-type counts ("MCQ n + short-answer m") — the MCQ pipeline is invoked unchanged while short-answer items are generated one per API call — merging into a single question set via the existing `generated_questions` JSONB payload. (Deferred by explicit decision: MCQ KC assignment; MCQ one-call-per-question refactor.)
3. **AI feedback**: port grading Methods 1/2/3 from the reference project behind a single `POST /api/short-answer/grade` route, with per-school method/model/temperature configuration (teacher/admin editable, system default fallback) and full per-attempt metrics capture.

Technical approach: reuse the reference implementation (`cocoj1115/mvp4-internal-testing`) nearly verbatim for the LLM layer (`lib/llm.ts` — OpenAI SDK + Anthropic SDK + Gemini via OpenAI-compatible endpoint), the three grading methods, and the AIG pipeline; copy its curated data files into this repo. New Supabase tables for part attempts, feedback settings, feedback reports, and student notes; short-answer item content lives in the existing `generated_questions.payload` JSONB (no question-table migration). See [research.md](./research.md) for all decisions.

## Technical Context

**Language/Version**: TypeScript (strict, `any` forbidden), Node.js 22.x

**Primary Dependencies**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Supabase (`@supabase/ssr`), Framer Motion, Recharts, lucide-react. **New**: `openai` (OpenAI + Gemini via OpenAI-compatible baseURL), `@anthropic-ai/sdk` (Claude). Existing `@google/generative-ai` stays for the MCQ pipeline (untouched).

**Storage**: Supabase Postgres with RLS. New tables: `short_answer_attempts`, `feedback_settings`, `feedback_reports`, `student_question_notes`; new column `user_settings.short_answer_tour_seen_at`. Short-answer item content stored in existing `generated_questions.payload` (JSONB). Curated reference data (KC table, taxonomy/cards, exemplars, rubric anchors, G* adaptation rules, KB embeddings) bundled as repo files under `src/data/short-answer/`.

**Testing**: Vitest + jsdom (`*.test.ts` next to source, `vi.mock()` for Supabase/LLM). Playwright for E2E. New route handlers get authorized + unauthorized path tests per constitution.

**Target Platform**: Vercel (Fluid Compute; default function timeout 300s covers multi-call LLM grading/generation). Client: Chromebooks and mobile browsers ≥360px.

**Project Type**: Web application (single Next.js project, existing structure).

**Performance Goals**: Feedback visible ≤15s after submission (p95, SC-001); empty submissions resolve <1s (SC-002); generation run ≥90% valid within retry budget (SC-003). Existing p95 budgets (500ms server / 3s interactive) apply to non-LLM paths; LLM routes show explicit loading states and a 60s per-call timeout with retriable error (FR-023).

**Constraints**: English-only UI; visual design follows the `/assignments` page style (frosted-glass card tokens `--assignment-glass-bg*`/`--assignment-card-shadow`, `rounded-2xl`, pill controls, green/forest palette — spec FR-002); WCAG 2.1 AA (attempt dots need accessible labels, not color alone); no `dangerouslySetInnerHTML` (diagram SVG rendered via `<img>` data-URI after validation); `SUPABASE_SERVICE_ROLE_KEY` and all LLM keys server-side only; new endpoints role-protected in-handler (not middleware-only); every generated item tagged with a valid `STANDARD_DEFINITIONS` id.

**Scale/Scope**: 100+ live users, classroom bursts of 30+ concurrent students. Each student submission = 1–2 LLM calls (method-dependent); a class burst is ~30–60 concurrent upstream calls — stateless route handlers on Fluid Compute absorb this; no queue needed at current scale. ~6 new API route groups, ~10 new components, 1 new student page (`/my-notes`), 1 teacher dashboard section, 4 new tables + 1 column, ~1.5MB bundled reference data.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | English-Only Product Surface | PASS | All new UI strings, AI prompts, and spec artifacts are English. Prompts ported from the reference project are already English. |
| II | Intuitive UX | PASS | Spec mandates labeled attempt dots + onboarding tour (SC-006), plain-language feedback, passive (non-blocking-input) countdown, ≥360px responsive layout. Highlight/report/notes interactions have visible affordances. WCAG: dots carry text labels; modals keyboard-navigable. |
| III | Scalability & Reliability | PASS (with notes) | LLM calls are server-side, guarded with timeouts + graceful retriable errors (FR-023); a grading failure never blocks the page or consumes the attempt. Empty submissions short-circuit without LLM calls. New tables indexed on `(user_id, question_id)` / `(school_id)` hot paths. Capacity note: +1–2 LLM calls per part submission; reference data loaded server-side with module-level caching (no per-request file reads after warmup). |
| IV | Curriculum Alignment | PASS | Generated items require `standardId` ∈ `STANDARD_DEFINITIONS` (`src/lib/standards.ts`); the generator's standard picker is driven by that file, mapped to the reference KC table's standard codes (same `3.1.9-12.X` format). Prompts/rubrics/schemas versioned in repo under `src/lib/short-answer/`. |
| V | Privacy & Role-Based Access | PASS (with documented justification) | **Third-party data justification (required by Principle V)**: grading sends ONLY the student's free-text answer + question content + rubric to OpenAI/Anthropic/Google — never names, emails, student IDs, or scores. This is intrinsic to AI grading and is documented here and in the PR. RLS on all new tables; grade/generate/settings/reports routes re-verify `supabase.auth.getUser()` + `profiles.role` in-handler; feedback settings never reach student clients (server resolves them per submission). All schema changes land as migrations. |

**Technical Standards deviations**: see Complexity Tracking (new AI SDK dependencies; env-var access location).

**Post-Phase-1 re-check**: PASS — design artifacts (data-model.md, contracts/) conform; deviations remain limited to the two items in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-short-answer-questions/
├── spec.md                  # Feature specification
├── reference-pipeline.md    # Verbatim technical reference (AIG + Methods 1/2/3)
├── plan.md                  # This file
├── research.md              # Phase 0 output
├── data-model.md            # Phase 1 output
├── quickstart.md            # Phase 1 output
├── contracts/               # Phase 1 output
│   ├── short-answer-grade.md
│   ├── short-answer-generate.md
│   ├── feedback-settings.md
│   ├── feedback-reports.md
│   └── student-notes.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
src/
├── types/
│   └── short-answer.ts                  # ShortAnswerItem, StimulusAsset, Part, Blueprint, PartAttempt, etc.
├── data/
│   └── short-answer/                    # Copied from reference repo (see research.md R2)
│       ├── kc_table.csv
│       ├── taxonomy_and_cards.json
│       ├── exemplars.json
│       ├── rubrics.json
│       ├── standards.json
│       ├── gstar/G_star_*.json          # Method 1 GradeOpt adaptation rules
│       └── kb/{kd1,kd2,ke}_embeddings.json  # Method 1 RAG collections
├── lib/
│   ├── llm/
│   │   ├── client.ts                    # chatComplete() — port of reference lib/llm.ts
│   │   ├── models.ts                    # generation + grading model catalogs, per-method defaults
│   │   └── env.ts                       # getOpenAIKey()/getAnthropicKey()/getGeminiKey()
│   └── short-answer/
│       ├── item-schema.ts               # Zod-free structural validators (item, blueprint)
│       ├── generation/
│       │   ├── pipeline.ts              # blueprint → item, no-RAG context assembly, retry loop
│       │   ├── prompts.ts               # blueprint + item prompts (TELeR L3, versioned)
│       │   └── data.ts                  # KC/taxonomy/cards/exemplars/rubrics loaders (cached)
│       ├── grading/
│       │   ├── method1.ts               # GradeOpt + RAG single-call
│       │   ├── method2.ts               # two-stage score → feedback
│       │   ├── method3.ts               # error-analysis-first + boundary examples
│       │   ├── common.ts                # normalizeScore, normalizeFeedback, types
│       │   ├── retrieval.ts             # KD1/KD2/KE embedding retrieval (Method 1)
│       │   └── boundary-examples.ts     # per-item boundary pairs (Method 3)
│       ├── settings.ts                  # resolve effective feedback config (school → default)
│       └── attempts.ts                  # persistence helpers for short_answer_attempts
├── app/
│   ├── api/
│   │   ├── short-answer/
│   │   │   ├── grade/route.ts           # POST — student grading (all modes)
│   │   │   └── generate/route.ts        # POST — teacher/admin item generation
│   │   ├── feedback-settings/route.ts   # GET/PUT — teacher/admin per-school config
│   │   ├── feedback-reports/route.ts    # POST (student) / GET+PATCH (teacher/admin)
│   │   └── student-notes/route.ts       # GET list for /my-notes (writes go via RLS client)
│   └── my-notes/page.tsx                # Student notes collection
└── components/
    └── short-answer/
        ├── ShortAnswerQuestionView.tsx  # Split-panel container (used by practice + exam modes)
        ├── StimulusPanel.tsx            # Stem + stimulus (table/chart/diagram/scenario/illustration)
        ├── PartCard.tsx                 # Textarea, Check button, attempt dots, lock states
        ├── FeedbackBlock.tsx            # Verdict, segments, glossary chips, model answer, countdown
        ├── AttemptHistoryModal.tsx
        ├── HighlightLayer.tsx           # Selection-based highlighting
        ├── CompletionSection.tsx        # Key Terms + My Notes + Continue
        ├── ReportFeedbackModal.tsx
        ├── SpotlightTour.tsx
        └── GlossaryPopup.tsx

supabase/migrations/
├── <ts>_short_answer_attempts.sql
├── <ts>_feedback_settings.sql
├── <ts>_feedback_reports.sql
├── <ts>_student_question_notes.sql
└── <ts>_user_settings_sa_tour.sql

Integration points (existing files modified):
├── src/components/modes/AdaptivePracticeMode.tsx   # branch to ShortAnswerQuestionView
├── src/components/modes/ExamMode.tsx               # single-attempt short-answer + deferred review
├── src/hooks/useQuestions.ts                       # include short-answer items
├── src/components/Sidebar.tsx                      # "My Notes" nav item
├── src/app/teacher-dashboard/page.tsx              # Feedback settings card + Reports section
├── src/app/content/mass-production/page.tsx        # per-type counts (MCQ n + short-answer m),
│                                                   #   short-answer advanced options,
│                                                   #   mixed-set save (one item per generate call)
├── src/app/content/questions/[setId]/page.tsx      # set detail renders short-answer items
│                                                   #   (view + existing per-question delete)
├── middleware.ts                                   # role map entries for new routes
└── .env.local.example                              # OPENAI_API_KEY, ANTHROPIC_API_KEY
```

**Structure Decision**: Single Next.js project (existing). All short-answer logic is namespaced under `src/lib/short-answer/`, `src/components/short-answer/`, and `src/app/api/short-answer/` so the MCQ pipeline remains untouched; the only shared seams are the question payload type, the mode components, and the sidebar/dashboard integration points listed above.

## Complexity Tracking

> Deviations from the constitution's Technical Standards, with justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New dependencies `openai` + `@anthropic-ai/sdk` (constitution stack lists only `@google/generative-ai`) | Feedback methods require Claude (Methods 1/3 defaults) and GPT (Method 2 default) per user-specified recommended models; generation offers 5 models across 3 providers | Calling provider REST APIs with raw `fetch` duplicates auth/streaming/error handling the SDKs provide and diverges from the proven reference implementation, increasing porting risk |
| LLM API keys read via `process.env` in `src/lib/llm/env.ts` getters (constitution: `process.env` only inside `src/lib/supabase/env.ts`) | Supabase env module is Supabase-scoped; LLM keys need the same getter-function pattern in an LLM-scoped module. Matches existing precedent (`src/lib/gemini.ts` reads `GEMINI_API_KEY` directly) | Adding non-Supabase getters to `src/lib/supabase/env.ts` muddles that module's contract; we replicate the *pattern* (getters, no scattered `process.env`) in one dedicated module |
