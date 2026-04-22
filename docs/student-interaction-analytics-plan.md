# Student Interaction Analytics Plan (Admin Data Analysis)

## Confirmed Decisions (2026-04-20)

1. Exports should support **student-level rows** (not only aggregated exports).
2. Analysis scope is **school-level**. Current class-related legacy code should not drive analytics scope.
3. Ingestion and dashboards should be **near real-time**.
4. Do **not** enforce a hard maximum row limit for CSV exports. Handle large exports asynchronously.
5. No admin-role differentiation is required now (single admin operator).
6. Retention period is set to **1 year**.

## Confirmed Decisions (2026-04-21, scope update)

7. **Misconception shift (pre vs post) is out of scope for this app.** Pre/post-tests will be administered via a separate Google Form. No need to add misconception labels to question distractors for in-app analytics.
8. **In-app analytics targets these four questions:**
   - Q2: Is the scaffolding effective? (attempt1 wrong → attempt2 correctness patterns, clustered by standard)
   - Q3: Do students genuinely understand, or are they scaffolding-dependent? (Practice vs Exam accuracy gap on the same standards)
   - Q4: Are there routing/bug issues in Review Mode? (Practice error rate vs Review Mode usage and dwell time)
   - Q5: Completion rate, drop-off, time-on-task per module and session
9. **Add session-lifecycle logging.** Implement `session_started` / `session_ended` and write to `analytics_sessions` so Review Mode dwell time (Q4) and total session time / drop-off (Q5) become measurable.
10. **Add per-question quality metrics to the dashboard.** Accuracy, first-attempt accuracy, distractor usage, discrimination, and time percentiles are all derivable from the existing `public.attempts` table without new logging.
11. **Add feature usage logging for glossary (inline vs sidebar), TTS (read-aloud), and confidence rating.** These are currently not logged at all.

## Goals

Build an end-to-end analytics pipeline that:

1. Captures fine-grained student interaction data with minimal data loss.
2. Supports reliable educational analysis (misconceptions, scaffolding impact, review effectiveness).
3. Gives admins a dedicated **Data Analysis** area to explore and export data.
4. Surfaces data-quality issues early so bugs do not pollute analysis.

## Proposed Product Scope

### Admin IA update

- Add a new sidebar item for admin users only: **Data Analysis**.
- Route suggestion: `/content/data-analysis` (keeps it in the admin content namespace).

### Data Analysis page sections

1. **Overview dashboard**
   - Active students, sessions, completion rate, median time-on-task.
   - Data quality summary (missing logs, duplicate submissions, zero-duration attempts).
2. **Learning Effectiveness**
   - Scaffolding Effectiveness (Immediate: attempt1 wrong → attempt2 correct rate, by standard).
   - Practice vs Exam gap (per-standard accuracy delta, to detect scaffold-dependent learners).
   - _Note: misconception shift (pre vs post) is handled via an external Google Form and is out of in-app scope._
3. **Engagement & Flow**
   - Stage completion funnel with drop-off.
   - Practice error rate vs Review Mode engagement scatter (entry rate, dwell time, completion).
   - Session-level time-on-task distribution.
4. **Question Quality Diagnostics** (new)
   - Per-question table: accuracy, 1st-attempt accuracy (Practice), unique-users n, time-to-answer p50 / p90, discrimination index.
   - Selection rate per choice (flag distractors that are never / always selected).
   - Mode comparison per question (Practice vs Exam accuracy).
   - Derivable entirely from existing `public.attempts` data — no additional instrumentation required.
5. **Feature Usage**
   - Glossary interactions split by **inline** vs **sidebar** source.
   - TTS (read-aloud) usage.
   - Hint (scaffold) open / close timing and dwell.
   - Confidence rating submission rate.
6. **Data Explorer + Export**
   - Filterable student-level table.
   - CSV export for current filtered data and metric summaries.

## School-level Data Model (minimum viable)

To compute the requested metrics accurately, store append-only events and stable attempt records.

### A. Session-level table

`analytics_sessions`

- `id` (uuid, pk)
- `school_id` (uuid, required, indexed)
- `user_id` (uuid, required)
- `role` (text snapshot)
- `mode` (practice | exam | review | assignment)
- `started_at`, `ended_at`
- `client_started_at` (timestamptz, optional)
- `device_type`, `browser`, `os` (optional but useful for bug patterns)
- `timezone`

Why: session boundaries are needed for total time-on-task and dropout detection.

### B. Attempt-level table

`analytics_attempts`

- `id` (uuid, pk)
- `school_id` (uuid, required, indexed)
- `session_id` (uuid, fk)
- `user_id` (uuid, required)
- `question_id` (text/uuid)
- `assignment_id` (nullable)
- `standard_id` (text, denormalized snapshot)
- `mode` (practice/exam/review)
- `attempt_index` (1,2,3... within question flow)
- `selected_choice_id` (text)
- `is_correct` (boolean)
- `correct_choice_id` (text snapshot)
- `is_distractor` (boolean)
- `submitted_at`
- `time_to_submit_ms`
- `hints_used_count`
- `used_scaffold` (boolean)
- `feedback_shown` (boolean)
- `client_attempt_id` (idempotency key)

Why: this is the backbone for misconception and scaffolding metrics.

### C. Interaction events table

`analytics_events`

- `id` (uuid, pk)
- `school_id` (uuid, required, indexed)
- `session_id` (uuid, fk)
- `user_id` (uuid)
- `event_type` (enum-like text)
- `mode` (practice/exam/review)
- `question_id` (nullable)
- `assignment_id` (nullable)
- `occurred_at`
- `payload` (jsonb)

Recommended `event_type` values:

- `session_started`, `session_ended` *(not yet emitted; PR 1)*
- `question_viewed` *(emitted)*
- `hint_opened` *(emitted, fires when scaffold is shown)*, `hint_closed` *(not yet emitted; PR 1)*
- `explanation_opened` *(not yet emitted; PR 3)*
- `attempt_submitted` *(emitted; payload carries `attemptIndex`, `isCorrect`, `selectedOptionId`, `showScaffold`, `elapsedSec`)*
- `review_mode_entered` *(not yet emitted; PR 1)*, `review_mode_exited` *(new; PR 1)*, `review_item_opened` *(emitted)*, `review_item_completed` *(emitted)*
- `stage_started` *(not yet emitted; PR 1)*, `stage_completed` *(emitted)*, `stage_abandoned` *(not yet emitted; PR 1)*
- `glossary_term_opened` *(new; PR 3; payload includes `source: "inline" | "sidebar"`, `termId`, `scaffoldShown`)*
- `tts_played` *(new; PR 3; for the ReadAloudButton)*
- `confidence_submitted` *(new; PR 3; payload includes `confidenceLevel`, `isCorrect`)*
- `bookmark_added`, `bookmark_removed` *(new; PR 3; optional)*
- `export_triggered` (admin action audit)

Why: event granularity enables flow analysis, bug detection, and feature-usage analysis.

### D. Data quality table

`analytics_data_quality_hourly`

- `hour_bucket` (timestamptz)
- `school_id`
- `zero_time_attempt_count`
- `missing_attempt_log_count`
- `duplicate_client_attempt_id_count`
- `invalid_stage_transition_count`
- `notes`

Why: near-real-time monitoring needs hourly (or shorter) buckets, not only daily rollups.

## Metric Mapping (requested)

| Metric | Required fields | Calculation outline | Admin UI expression |
|---|---|---|---|
| Scaffolding Effectiveness (Immediate) — **Q2** | `attempt_index`, `is_correct`, `used_scaffold` (or `attempt_submitted` event payload) | `P(attempt2 correct \| attempt1 wrong, scaffold shown)` by standard/question set. | Heatmap by standard and question difficulty. |
| Scaffold Dependence (Practice vs Exam) — **Q3** | `attempts.mode`, `attempts.standard_id`, `is_correct` | Compare per-learner Practice accuracy vs Exam accuracy on the same standards. Large positive gap = likely scaffold-dependent. | Scatter plot + gap distribution histogram. |
| Review Mode Routing — **Q4** | Practice error rate + `review_mode_entered`/`exited` + `review_item_opened`/`completed` | Correlate practice error% with review entry rate, review dwell time (from session + mode events), and completion. | Correlation card + quadrant chart (high error / low review etc.). |
| Completion Rate & Drop-off — **Q5** | `stage_started`, `stage_completed`, `stage_abandoned`, `analytics_sessions` timestamps | Stage completion funnel, drop-off rates per stage, median stage duration. | Funnel + stage duration boxplot. |
| Time-on-Task — **Q5** | `analytics_sessions.started_at/ended_at`, `attempts.time_spent_sec` | Total session time; per-module median / p90; per-question duration outliers. | Trend lines + percentile table. |
| Per-Question Quality — **new** | `attempts.question_id`, `is_correct`, `selected_option_id`, `time_spent_sec`, `mode` | Accuracy, 1st-attempt accuracy, choice selection rate, discrimination index, time p50 / p90. | Sortable table + selection-rate bar chart. |
| System Bugs | quality signals + event consistency | Rule-based anomaly checks (zero duration, missing logs, duplicate submissions). | Live issue panel + hourly trend. |

_Note: Misconception Shift (pre vs post) is delivered via an external Google Form and is intentionally not on this list._

## UI Design Recommendations

### 1) Default filters (school scope)

- Date range (required)
- School (required; if multi-school admin exists)
- Grade level
- Standard/chapter
- Mode (practice/exam/review)
- Student ID / Student name

> Note: do not expose legacy class filters unless class entities become first-class in product scope.

### 2) Readability principles

- Show metric definition tooltips beside each chart title.
- Always show denominator (`n`) next to percentages.
- Show confidence intervals for comparisons where possible.
- Mark low-sample metrics with warning badges.

### 3) Student-level CSV export UX

- Export buttons for:
  - Raw attempts (student-level)
  - Event logs (student-level)
  - Metric summary tables
- Include current filter metadata in exported file header rows.
- Async export for large datasets with status + retry (no hard row cap).
- Include a “Contains personal data” warning before download.

## Near Real-time Architecture Recommendation

1. **Client write path**
   - Log events/attempts from UI interactions with `client_attempt_id` / `client_event_id` idempotency keys.
2. **Ingestion API**
   - Batch endpoint every 5–15 seconds from client queue (or on significant actions).
3. **Freshness target**
   - P95 event-to-dashboard latency target: ≤ 60 seconds.
4. **Aggregation jobs**
   - Incremental materialized tables updated every 1 minute for heavy charts.
5. **Fallback**
   - If real-time pipeline degrades, automatically fall back to raw-table queries for last 15 minutes.

## Additional Analytics Worth Adding

1. **Hint Dependency Index**
   - Ratio of correct answers requiring hints vs no-hint correct answers.
2. **Knowledge Retention Lag**
   - Accuracy decay by days since last successful practice on same standard.
3. **Confidence-Performance Gap** (if confidence capture is added)
   - High confidence + wrong answer indicates deeper misconceptions.
4. **Question Quality Diagnostics**
   - Very high/very low discrimination and abnormal distractor non-use.
5. **School Health Snapshot**
   - School-level weekly trend card: completion, time-on-task, and misconception concentration.

## Data Governance & Safety (student-level export enabled)

- Keep student-level export enabled for admins, but log all export operations.
- Add export audit logs (`who`, `when`, `school_id`, `what filters`, `row count`).
- Apply strict school-level scoping in all admin analytics queries.
- Retain raw analytics data and audit logs for **1 year**.
- Support pseudonymized export as an optional mode for safer sharing.

### Note: What is PII masking?

- **PII** means personally identifiable information (for example student name, email, student number).
- **PII masking** means hiding or partially hiding those fields in some views or exports (for example, email as `a***@school.edu`).
- In this plan, masking is optional. Since there is currently one admin and no role split, full student-level export is allowed.

## Implementation Sequence (revised 2026-04-21)

The previous phase list assumed a green-field build. Since tables, RLS, ingestion API, admin sidebar, and the `attempts` pipeline are already in place, the remaining work is delivered as a **single PR** with three logical parts. Commits inside the PR are split so reviewers can read them independently.

### Part A — Session / Stage / Review Mode boundary logging (commit 1)

Goal: make Q4 (review dwell time) and Q5 (session time-on-task, drop-off) directly answerable.

**Client instrumentation**

- Add a small session manager in `src/lib/analytics/session.ts` that
  - Calls `POST /api/analytics/sessions` to create an `analytics_sessions` row on app mount / first meaningful interaction per mode.
  - Emits `session_ended` on `beforeunload` and `visibilitychange === "hidden"` with `navigator.sendBeacon` or `fetch(..., { keepalive: true })`.
  - Persists `sessionId` in `sessionStorage` and includes it in every `trackAnalyticsEvent` call (wire into `AdaptivePracticeMode` and `ExamMode`).
- Emit `stage_started` on mode entry, `stage_completed` on finish (already done), and `stage_abandoned` when the user leaves with unfinished questions.
  - **Abandonment rule (decided 2026-04-21):** fire on either (a) `visibilitychange === "hidden"` that persists > 60s while a stage is in progress, or (b) route change that leaves `/practice`, `/exam`, or an assignment page without a preceding `stage_completed`.
- Emit `review_mode_entered` / `review_mode_exited` at the outer review flow (not per-item).
- Emit `hint_closed` paired with `hint_opened` to compute scaffold dwell time.
- Extend `AnalyticsEventType` in `src/lib/analytics/client.ts` to include `review_mode_exited`.

**Server / DB**

- Add `POST /api/analytics/sessions` (create) and `PATCH /api/analytics/sessions/:id` (end) with the same pattern as `/api/analytics/events`: re-verify user server-side, resolve `school_id` from `school_members`.
- No new migrations required; the `analytics_sessions` table already exists.

**Verification**

- After a Practice run, confirm 1 session row with non-null `started_at` and `ended_at`.
- Confirm dwell time in Review Mode is computable as `review_mode_exited.occurred_at - review_mode_entered.occurred_at`.
- Trigger tab-switch > 60s mid-practice and confirm exactly one `stage_abandoned` event fires.

### Part B — Per-question accuracy dashboard (commit 2)

Goal: give admins a Question Quality Diagnostics view. Also directly supports Q3 by showing Practice vs Exam accuracy per question.

**Data layer**

- Add a migration `supabase/migrations/<ts>_question_stats_view.sql`. **Start as a plain view (decided 2026-04-21)**; switch to a materialized view + 1-minute refresh job only if query latency becomes a problem.

  ```sql
  CREATE OR REPLACE VIEW public.question_stats_v AS
  SELECT
    question_id,
    mode,
    COUNT(*) AS attempts_n,
    COUNT(DISTINCT user_id) AS unique_users,
    AVG(is_correct::int)::numeric(5, 4) AS accuracy,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY time_spent_sec) AS time_p50,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY time_spent_sec) AS time_p90
  FROM public.attempts
  GROUP BY question_id, mode;
  ```

- Add a second view for per-choice selection rate (`question_id, selected_option_id, n, share`).
- Grant SELECT only when `public.is_admin()`.
- Add a 1st-attempt accuracy view (take `MIN(answered_at)` per `(user_id, question_id)` within Practice mode).

**UI**

- New sub-route `/content/data-analysis/questions` (tab under the existing Data Analysis area).
- Sortable table: question_id (link to `/content/questions/:id`), standard, mode, n, accuracy, 1st-attempt accuracy, time p50, time p90, discrimination.
- Row expand: per-choice selection rate bar chart + mode comparison (Practice vs Exam accuracy).
- Badges for anomalies: "unused distractor", "too easy (>95%)", "too hard (<20%)", "low n (<20)".
- Add a small stats card to the existing question edit page `/content/questions/:id` so authors see live accuracy while editing.

**No new client instrumentation required** — data is derived from `public.attempts`.

### Part C — Feature usage logging (commit 3)

Goal: measure how often each feature is used and which variant is preferred.

- `GlossaryPopover.tsx`: fire `glossary_term_opened` on open with payload `{ termId, termLabel, source: "inline" | "sidebar", scaffoldShown, questionId, mode }`. Thread a `source` prop down from `AdaptivePracticeMode` (already has `inlineTermMap` vs sidebar list).
- `ReadAloudButton`: fire `tts_played` with `{ target: "question" | "choices" | "feedback", questionId, mode }`.
- Confidence rating: fire `confidence_submitted` with `{ confidenceLevel, isCorrect, questionId }` inside `AdaptivePracticeMode.handleConfidence`.
- `FeedbackPanel`: fire `explanation_opened` when expanded / first rendered.
- Optional: `bookmark_added` / `bookmark_removed` from the bookmark toggle (already have DB state but no event).
- Add these to `AnalyticsEventType` and dashboard tiles under the Feature Usage section.

### PR hygiene

- Keep the three parts as **separate commits** inside the same PR so `git log --oneline` reads as A → B → C.
- Each commit must pass `npm run lint` and `npm test` independently.
- Add unit tests for the new session manager (PR-size spot check: at least `session_started` is emitted once per mode, `session_ended` uses `keepalive`).

### Later (out of scope for this PR)

- Hourly data-quality job to populate `analytics_data_quality_hourly`.
- `analytics_attempts` backfill / dual-write (one-row-per-attempt with `attempt_index`, `used_scaffold`, `hints_used_count`) if ad-hoc joins between `attempts` and `analytics_events` become painful.
- Export audit log + async CSV export pipeline.
- Promote `question_stats_v` to a materialized view if its p95 read latency exceeds the 60s near-real-time target.

## Resolved Questions (2026-04-21)

1. **Single PR vs split PRs:** deliver as a **single PR with three commits** (A → B → C). Accept the larger diff in exchange for shipping the full analysis surface at once.
2. **`stage_abandoned` grace period:** 60 seconds of hidden visibility while a stage is in progress, _or_ a route change out of the practice/exam/assignment area without a preceding `stage_completed`.
3. **`question_stats_v` shape:** start as a **plain view**. Promote to a materialized view with a 1-minute refresh job only if latency becomes a problem.

## Remaining Open Questions

1. Should audit logs be immutable (append-only) for compliance?
