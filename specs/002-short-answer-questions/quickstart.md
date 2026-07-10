# Quickstart: Short-Answer (Constructed-Response) Questions

**Feature**: `002-short-answer-questions` | Branch: `002-short-answer-questions`

## Prerequisites

1. **Env vars** (add to `.env.local`; see `.env.local.example` after implementation):
   - `OPENAI_API_KEY` — GPT models (Method 2 default, generation, Method 1 embeddings)
   - `ANTHROPIC_API_KEY` — Claude models (Method 1/3 defaults, generation)
   - `GEMINI_API_KEY` — already present (Gemini generation option)
   - All server-side only. Never `NEXT_PUBLIC_`.
2. **Dependencies**: `npm install` (adds `openai`, `@anthropic-ai/sdk`).
3. **Migrations**: apply the five new files in `supabase/migrations/` (short_answer_attempts, feedback_settings, feedback_reports, student_question_notes, user_settings tour column).
4. **Reference data**: `src/data/short-answer/` must contain `kc_table.csv`, `taxonomy_and_cards.json`, `exemplars.json`, `rubrics.json`, `standards.json`, `gstar/G_star_*.json`, `kb/{kd1,kd2,ke}_embeddings.json` — copied from `cocoj1115/mvp4-internal-testing` `main` (`data/aig/`, `data/gstar/`, `data/kb/`). Do NOT copy `study_guide_chunks.json`.

## Verify: generation (US2)

1. `npm run dev`, log in as teacher or admin.
2. Open `/content/mass-production`. Select standard `3.1.9-12.A`, set counts to 3 MCQs + 2 short-answer items. Leave short-answer advanced options (KC/stimulus/model) on Auto (default model `gpt-5.4`). Generate.
3. Expect per-item progress (each short-answer item = 2 LLM calls server-side, so ~60s per item is normal); on completion the run saves ONE question set with both types and redirects to its detail page — same flow as MCQ today, no pre-save preview.
4. On the set detail page: each short-answer item shows stem, rendered stimulus, Parts A–C, holistic + per-part rubrics (sum = 3), annotated responses 0–3, no placeholder text. Delete one short-answer item with the existing per-question delete; confirm the rest remain. Link the set to a school; confirm it appears in that school's set list.
5. Regression: run again with short-answer count 0 — behavior matches today's MCQ-only generation.

## Verify: student answering + feedback (US1)

1. Log in as a student in that school; start a session containing the item (assignment or self practice).
2. First visit: 4-step spotlight tour auto-opens; skip it; confirm it doesn't reopen (reload) but the "How to use" button re-opens it.
3. Part A: Check is disabled while empty → type anything → enabled. Submit a wrong answer: red block, encouraging verdict, Socratic segments + "1 try left" pill, no model answer, textarea re-enabled, first dot red.
4. Submit a second wrong answer: verdict "Here's the idea" + plain-text model answer only; part resolves; "Part B unlocks in 3…" countdown, then auto-unlock + scroll.
5. Click a red dot: Attempt History modal shows only that attempt (your text + its feedback).
6. Select text in the passage → highlight appears; click the highlight → removed. Selection inside the textarea does nothing.
7. Report on Part A → modal → send → button becomes "Reported".
8. Finish Part C: completion section (Key Terms list, My Notes autosave "Saved" flash, Continue). Bottom bar shows "All done!"; Next enabled.
9. `/my-notes` (sidebar): the note appears with question preview; opening it shows the note beside the question.
10. Empty submission check: submit whitespace → instant "No response was submitted", attempt consumed, no LLM latency.

## Verify: exam mode deferral (US1/FR-037)

1. Start an exam session containing the item. Each part: one textarea, one submission, NO feedback/dots/countdown/completion section.
2. Submit the exam → review shows per-part scores, feedback, and model answers for incorrect parts. Nothing leaked during the exam (SC-008).

## Verify: settings (US3) + reports (US4)

1. As teacher: teacher dashboard → Short-Answer Feedback Settings card → school shows "Default (Method 2 — GPT 5.4)". Switch to Method 3 → model/temp auto-fill `claude-sonnet-4-6` / 0 → save.
2. Student in that school submits → attempt row records `method='3'`, `model_id='claude-sonnet-4-6'` (check `short_answer_attempts`). Student in another school still gets the default.
3. As student: confirm no settings UI is reachable and `/api/feedback-settings` returns 403.
4. As teacher: dashboard → Feedback Reports → the report from step US1-7 appears with answer + feedback context → mark reviewed → leaves unreviewed list.

## Tests

```bash
npm run lint
npm test          # includes: grading methods (LLM mocked), item/blueprint validators,
                  # settings resolution, route handlers (authorized + unauthorized paths)
npm run test:e2e  # optional Playwright pass over the practice flow
```

Key test files (planned, colocated): `src/lib/short-answer/grading/*.test.ts`, `src/lib/short-answer/item-schema.test.ts`, `src/lib/short-answer/settings.test.ts`, `src/app/api/short-answer/grade/route.test.ts`, `src/app/api/feedback-settings/route.test.ts`.

## Notes & gotchas

- Grading/generation routes call LLM providers; without the new API keys they fail gracefully (retriable error; attempt not consumed).
- The MCQ pipeline (`src/lib/gemini.ts`, `/api/generate-questions`) is untouched — regressions there indicate an integration-seam mistake (`useQuestions`, mode components).
- `attempts` summary rows use `selected_option_id='short-answer'`; teacher-dashboard aggregates treat them like any attempt row.
- Diagram SVGs render via `<img src="data:image/svg+xml,...">` — never `dangerouslySetInnerHTML`.
