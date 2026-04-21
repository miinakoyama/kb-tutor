# Pilot Monitoring Plan (3-day, 110 high school students)

This doc summarizes (1) the data the app already collects, (2) gaps we want to
close before the 3-day pilot, and (3) how that data should be aggregated for
both day-to-day monitoring during the pilot and for a grant proposal
afterwards.

Companion doc to `docs/student-interaction-analytics-plan.md`. That one covers
the original scaffolding for the admin Data Analysis area; this one is
operational: "how do we actually run and learn from a 3-day deployment with
110 users".

## 1. What we already capture

### `public.attempts` (primary answer log)

One row per submitted answer. Practice can emit multiple rows per
`(user_id, question_id)` — one per attempt in the scaffolding loop. Exam emits
one row per question per attempt.

Columns relevant to analytics:
`user_id, question_id, selected_option_id, is_correct, mode, module, topic,
standard_id, standard_label, time_spent_sec, answered_at, assignment_id,
client_attempt_id`

### `public.analytics_sessions`

One row per entry into `practice | exam | review | assignment`. Fields:
`started_at, ended_at, mode, timezone, role, device_type, browser, os`.

Note: the API accepts `deviceType / browser / os` but the client wasn't
actually sending them (see §3.1 below).

### `public.analytics_events`

Append-only interaction log. Emitted from `AdaptivePracticeMode.tsx` and
`ExamMode.tsx`:

| `event_type` | Payload |
|---|---|
| `session_started` / `session_ended` | `mode` |
| `stage_started` / `stage_completed` / `stage_abandoned` | `mode`, abandon reason |
| `question_viewed` | `questionId` |
| `attempt_submitted` | `selectedOptionId, isCorrect, attemptIndex, elapsedSec, showScaffold` |
| `hint_opened` / `hint_closed` | `openMs` |
| `explanation_opened` | `phase: completed | retry | exam_review` |
| `review_mode_entered` / `review_mode_exited` | — |
| `review_item_opened` / `review_item_completed` | `questionId` |
| `glossary_term_opened` | `source: inline | modal | sidebar, termId, termLabel, scaffoldShown` |
| `tts_played` | `target: question | choices | feedback` |
| `confidence_submitted` | `confidenceLevel, isCorrect` |
| `bookmark_added` / `bookmark_removed` | — |

### Admin Data Analysis surface (pre-pilot)

- `Insights` — Q2 scaffolding effect, Q3 practice vs exam, Q4 review routing,
  Q5 completion.
- `Student attempts` — row-level log + CSV.
- `Question quality` — per-question accuracy, distractor usage, mode
  comparison.
- `Feature usage` — glossary / TTS / confidence / explanation / hints.

## 2. Gaps that matter for a 3-day pilot

| Gap | Consequence |
|---|---|
| No "what happened today?" single-pane view | Hard to monitor the pilot day-to-day |
| No Day 1 vs Day 2 vs Day 3 trend | Can't show learning progression in the grant |
| No time-of-day activity | Can't distinguish in-class vs homework usage |
| No data-quality panel | Zero-duration answers, orphan attempts, unclosed sessions pollute analysis silently |
| `device_type / browser / os` aren't actually populated | Can't claim "worked across desktops, tablets, phones" with numbers |
| No per-student engagement list | Can't see which of the 110 students never logged in or bailed early |
| CSV export only in Students tab | Researcher hand-off is slower than it needs to be |
| Hint Dependency and Confidence Calibration not surfaced in Insights | Two of the strongest grant-friendly metrics are missing from the headline view |

## 3. Changes delivered for the pilot

### 3.1 Device / browser / OS capture

The `POST /api/analytics/sessions` handler already persists `device_type`,
`browser`, and `os`. The session hook now populates them from the client via a
tiny UA-sniffing helper. No schema change required.

Use cases: group metrics by device type; demonstrate multi-platform reach in
the grant narrative.

### 3.2 New Overview tab (`/content/data-analysis`)

This tab becomes the default landing page. It is built for a PI or admin
checking in once a day during the pilot.

Panels:

1. **Headline counters** — active students today, total attempts today, median
   session minutes, stage completion rate, scaffolding uplift.
2. **Daily trend** — 14-day (or pilot window) bar chart for attempts / active
   users / median session minutes. Also available as a per-hour breakdown for
   "today".
3. **Mode mix** — share of time spent in practice vs exam vs review.
4. **Device / browser mix** — stacked bar showing reach across devices.
5. **Data-quality panel** — zero-duration attempts, attempts missing a
   `client_attempt_id`, sessions with no `ended_at` over 6h old, duplicate
   client event ids.
6. **Per-student engagement table** — 110 rows, sortable by attempts /
   completion / last active. Inline detail drawer on click.

Implementation: `GET /api/admin/analytics/overview` computes all of the above
in Postgres where cheap (counts, distinct users) and in Node for small
post-processing. No new tables are required.

### 3.3 Pilot-friendly date presets

Every data-analysis page now accepts preset ranges: **Today, Yesterday, Last
24h, Last 7 days, Last 30 days, Pilot (all-time)**. The user can still override
with explicit `from` / `to`.

### 3.4 CSV export from every tab

Previously only the Students tab supported CSV. Now each dashboard offers a
"Download CSV" that matches its on-screen view:

- Insights → tidy summary (one row per research question + key metric).
- Questions → one row per `(questionId, mode)` with accuracy / time /
  discrimination.
- Feature usage → tidy counts per event slice.
- Overview → daily trend + engagement table.

Implementation reuses the existing `format=csv` convention from
`/api/admin/analytics`.

### 3.5 Hint Dependency and Confidence Calibration on Insights

Two new sections are appended to the Insights page:

- **Hint Dependency Index** = practice wrong-first → eventually correct
  divided by all wrong-first. High values can mean the scaffolding is doing
  the heavy lifting rather than the student understanding.
- **Confidence Calibration** = confidence × correctness matrix plus a scalar
  "overconfident wrong %" (sure + wrong) and "underconfident right %"
  (not_sure + right). These map to classic metacognition literature and are
  especially convincing in grant proposals.

Both reuse event data we already have (`hint_opened`, `attempt_submitted`,
`confidence_submitted`). No new instrumentation.

### 3.6 Per-student detail drawer

Clicking a student row on Overview opens a drawer with:
- Daily activity sparkline
- Mode mix (practice / exam / review)
- Recent attempts (last 20)
- Hint / glossary / TTS totals
- Last seen timestamp

All derived from existing tables.

## 4. What intentionally *isn't* in this PR

- **`analytics_attempts` dual-write / backfill.** We keep using `public.attempts`
  as the source of truth for answers. Promoting to `analytics_attempts` would
  be a larger migration with no added signal for the 3-day window.
- **Hourly data-quality rollup.** We compute data-quality counters live in the
  Overview endpoint. Moving them to `analytics_data_quality_hourly` is a
  post-pilot optimization if the live query gets slow.
- **Async CSV export.** With 110 students for 3 days we're comfortably under
  any limit that would require background export.
- **PII masking.** Single-admin context, all exports logged in access logs.
- **`assignment_started` / `assignment_completed` events.** Assignment usage
  isn't the primary scope of the pilot; we keep using `attempts.assignment_id`
  to derive participation when needed.

## 5. After the pilot — for the grant

With the data above we can frame the grant application around:

1. **Reach**: "110 high school students, X devices, Y browsers, Z unique
   sessions across 3 consecutive school days."
2. **Engagement**: active-user funnel (enrolled → logged in → completed ≥1
   stage → completed ≥N stages), median session minutes, median questions
   per student.
3. **Learning effectiveness**:
   - Practice first-attempt → final-attempt uplift (scaffolding worked).
   - Day 1 vs Day 3 first-attempt accuracy per standard (learning trend).
   - Practice vs exam gap per standard (genuine understanding).
4. **Scaffolding balance**: Hint Dependency Index should be in the "helpful
   but not a crutch" band (target: 0.35–0.65 recovery, not 0–1 extremes).
5. **Metacognition**: Confidence calibration matrix — ideally increasing
   "sure + right" share and decreasing "sure + wrong" share from Day 1 to
   Day 3.
6. **Reliability**: data-quality counters near zero, completion rate > 60%,
   no known routing bugs (Q4 shows struggling students actually land in
   review mode).
