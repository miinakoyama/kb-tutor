# Student Interaction Analytics Plan (Admin Data Analysis)

## Confirmed Decisions (2026-04-20)

1. Exports should support **student-level rows** (not only aggregated exports).
2. Analysis scope is **school-level**. Current class-related legacy code should not drive analytics scope.
3. Ingestion and dashboards should be **near real-time**.
4. Do **not** enforce a hard maximum row limit for CSV exports. Handle large exports asynchronously.
5. No admin-role differentiation is required now (single admin operator).
6. Retention period is set to **1 year**.

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
   - Misconception Shift chart (pre vs post distractor distribution).
   - Scaffolding Effectiveness (Immediate + Persistent).
3. **Engagement & Flow**
   - Stage completion funnel with drop-off.
   - Practice error rate vs Review Mode engagement scatter.
4. **Data Explorer + Export**
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

- `session_started`, `session_ended`
- `question_viewed`
- `hint_opened`, `hint_closed`
- `explanation_opened`
- `attempt_submitted`
- `review_mode_entered`, `review_item_opened`, `review_item_completed`
- `stage_started`, `stage_completed`, `stage_abandoned`
- `export_triggered` (admin action audit)

Why: event granularity enables flow analysis and bug detection.

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
| Misconception Shift | `selected_choice_id`, `is_correct`, `attempt_index`, `mode`, `standard_id` | Compare distractor distribution in pre-state (first attempt / pre-review) vs post-state (later attempt / post-review). | Sankey or grouped stacked bars by distractor label. |
| Scaffolding Effectiveness (Immediate) | `attempt_index`, `is_correct`, `used_scaffold` | `P(attempt2 correct \| attempt1 wrong, scaffold shown)` by standard/question set. | Heatmap by standard and question difficulty. |
| Scaffolding Effectiveness (Persistent) | Practice/exam attempts with same `standard_id` | Compare practice accuracy vs exam accuracy gap per learner/cohort. | Scatter plot + gap distribution histogram. |
| Review Mode Routing | Practice error rate + review events/time | Correlate practice error% with review entry rate, review dwell time, and completion. | Correlation card + quadrant chart (high error/low review etc.). |
| Completion Rate | stage events + session timestamps | Stage completion funnel, drop-off rates, median stage duration. | Funnel + stage duration boxplot. |
| Time-on-Task | session and attempt times | Total and per-module median/p90; per-question duration outliers. | Trend lines + percentile table. |
| System Bugs | quality signals + event consistency | Rule-based anomaly checks (zero duration, missing logs, duplicate submissions). | Live issue panel + hourly trend. |

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

## Implementation Sequence (updated)

1. **Phase 1: Instrumentation + idempotency**
   - Add event/attempt/session writes and resilient client queue.
2. **Phase 2: Storage/RLS (school scope)**
   - Create analytics tables + admin-only read policies with `school_id` constraints.
3. **Phase 3: Near real-time ingestion**
   - Add ingestion endpoint + 1-minute aggregate refresh jobs.
4. **Phase 4: Admin UI (MVP)**
   - Sidebar item, school-scoped filters, core charts, student-level CSV exports.
5. **Phase 5: Data quality and advanced analytics**
   - Hourly anomaly checks + retention/hint/question diagnostics.

## Remaining Open Questions

1. Should audit logs be immutable (append-only) for compliance?
