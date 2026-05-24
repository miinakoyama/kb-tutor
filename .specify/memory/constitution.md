<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0
Rationale: Scope Principle IV down to what the system actually does
today. Removed forward-looking requirements that have no implementation
yet (AI-generated content review pipeline) and the operational severity
rule that depended on a review process not yet in place. The remaining
"curriculum alignment" rule is restated against the real source of
truth: src/lib/standards.ts (id format `3.1.9-12.X` etc.). This is a
MINOR bump because principle guidance is materially narrowed but
remains backward-compatible with prior compliance.

Modified principles:
  - IV. Educational Accuracy and Curriculum Alignment → narrowed to
    standards-tagging only. AI review and P1 severity rules removed
    pending a real review feature.

Added sections: None.
Removed sections: None (only sub-rules within Principle IV).

Templates requiring updates:
  - .specify/templates/plan-template.md ✅ compatible
  - .specify/templates/spec-template.md ✅ compatible
  - .specify/templates/tasks-template.md ✅ compatible
  - AGENTS.md / CLAUDE.md / .cursorrules ✅ compatible

Follow-up TODOs:
  - When a human/automated review pipeline for AI-generated content is
    introduced, reinstate the corresponding rules under Principle IV
    and bump accordingly (likely MINOR).
-->

# kb-tutor Constitution

kb-tutor is an MCQ-based learning support web application that helps
Pennsylvania high school students prepare for the **Keystone Biology
Exam**. It is used by three roles — students, teachers, and admins —
and is already live with 100+ real users. This constitution defines
the non-negotiable principles that govern every change to the system.

## Core Principles

### I. English-Only Product Surface (NON-NEGOTIABLE)

The product is built for Pennsylvania high school students and their
teachers. Every artifact that a user, contributor, or operator can
read MUST be written in English, regardless of the language used in
prompts, issues, chats, or other development conversations.

This rule covers, without exception:

- All user-facing UI strings: labels, buttons, headings, placeholders,
  tooltips, helper text, empty states, loading messages, validation
  errors, and toast/alert copy.
- All AI-generated content shown to users (e.g., Gemini prompts,
  generated questions, explanations, hints, feedback).
- All committed documentation: `README.md`, `AGENTS.md`, `CLAUDE.md`,
  `.cursorrules`, files under `.specify/`, `docs/`, ADRs, and any
  per-feature spec/plan/tasks artifacts.
- All code-level comments, identifiers, commit messages, PR titles
  and descriptions, and CHANGELOG entries.

Rationale: Users are PA high schoolers studying for an English-language
state exam; mixed-language UI or docs would create confusion, harm
accessibility, and erode contributor trust. Authors MAY think and chat
in any language, but the artifacts they produce MUST land in English.

### II. Intuitive UX for Students and Teachers

The system MUST be usable by a high school student or teacher with
no training. Every feature MUST satisfy:

- **Discoverability**: Primary actions for each role (start practice,
  review mistakes, create assignment, view results) are reachable in
  ≤ 2 clicks from the role's landing page.
- **Clarity**: Each screen has a single primary task, plain-English
  copy at roughly an 8th-grade reading level, and never relies on
  jargon, icons-only controls, or hidden gestures.
- **Forgiveness**: Destructive actions (delete, reset progress,
  unpublish) MUST require explicit confirmation and SHOULD be
  reversible where technically feasible.
- **Accessibility**: UI MUST meet WCAG 2.1 AA for color contrast,
  keyboard navigation, focus order, and form labeling. Math content
  rendered via KaTeX MUST remain selectable/zoomable and MUST NOT use
  `dangerouslySetInnerHTML`.
- **Responsiveness**: All student- and teacher-facing pages MUST work
  on Chromebooks and standard mobile browsers (≥ 360px width).

Rationale: The audience is non-technical, often time-pressed, and
operating in classroom or at-home conditions. Friction directly
reduces study time and learning outcomes.

### III. Scalability and Reliability for Concurrent Users

The system already serves 100+ users and is expected to grow. Every
change MUST preserve the ability to handle bursty, classroom-scale
concurrency (e.g., a full class of 30+ students starting an
assignment simultaneously) without degraded experience.

Mandatory rules:

- Performance budgets: p95 server response time ≤ 500ms and p95
  full-page interactive time ≤ 3s on a typical Chromebook over
  classroom Wi-Fi for the core student flows (login, start session,
  submit answer, view review).
- No N+1 queries on student/teacher hot paths. Database access MUST
  use indexed columns for any filter touching `profiles`, sessions,
  questions, or assignments.
- Server Components are the default for data fetching. `"use client"`
  is added only when interactivity demands it.
- Heavy or third-party calls (Gemini, large reads) MUST be guarded
  with timeouts and graceful fallback UI; a single upstream failure
  MUST NOT take down a page.
- All `localStorage` access MUST be guarded with
  `typeof window !== "undefined"` to keep SSR safe.
- Load-affecting changes (new endpoints, new queries on hot paths,
  new external calls) MUST include a brief capacity note in the PR
  describing expected requests/user/session.

Rationale: A flaky or slow tutor during a graded assignment is worse
than no tutor at all; reliability is a feature.

### IV. Curriculum Alignment with Keystone Biology Standards

kb-tutor exists to prepare students for the **Pennsylvania Keystone
Biology Exam**. Every piece of study content the system surfaces
MUST be anchored to the Keystone Biology standards defined in the
codebase.

Rules:

- The canonical list of standards lives in `src/lib/standards.ts`
  (`STANDARD_DEFINITIONS`, IDs of the form `3.1.9-12.A`, grouped
  into modules `A` and `B` per `MODULE_TITLES`). This file is the
  single source of truth; do not introduce a parallel taxonomy.
- Every question and its associated explanation/feedback that is
  shown to students MUST be tagged with at least one standard ID
  from `STANDARD_DEFINITIONS`. The tag MUST be a valid `id` value
  from that file — free-form strings are not allowed.
- When a new standard becomes part of the Keystone Biology scope,
  it MUST be added to `STANDARD_DEFINITIONS` (and any consuming
  types in `src/types/`) before content referencing it is shipped.
- Prompts, rubrics, and content schemas used to author or generate
  content MUST be versioned in the repo (see `src/lib/prompts.ts`
  and related modules) so behavior changes are auditable.

Rationale: Tagging every item against `standards.ts` is what makes
"weak-anchor review", per-module analytics, and assignment-by-
standard work. Drifting away from this single source of truth
would silently break those flows.

### V. Student Data Privacy and Role-Based Access

Students are minors. Access control and data handling MUST be
conservative by default.

Rules:

- The three roles `student` / `teacher` / `admin` MUST be enforced
  at every layer: Supabase RLS, route handlers, and UI gating. Role
  resolution priority is fixed: `profiles.role` →
  `user_metadata.role` → `app_metadata.role`.
- Route handlers MUST re-verify the user with
  `supabase.auth.getUser()` and re-check the role from the
  `profiles` table; middleware checks alone are insufficient.
- `SUPABASE_SERVICE_ROLE_KEY` is server-side only and MUST NEVER be
  imported, bundled, or referenced from client code.
- Environment variables MUST be accessed via the getter functions
  in `src/lib/supabase/env.ts`; `process.env` is not referenced
  directly outside that module.
- Personally identifiable student data (names, emails, answers,
  scores) MUST NOT be sent to third-party services without an
  explicit, documented justification in the corresponding spec/PR.
- Schema and policy changes MUST land as migrations in
  `supabase/migrations/`; ad-hoc changes via the Supabase dashboard
  are not allowed.

Rationale: A K-12 product handling student performance data has
both ethical and legal exposure (FERPA-style expectations); least
privilege is the only safe default.

## Technical Standards

The following stack and conventions are part of the constitution.
Deviations MUST be justified in the Complexity Tracking section of
the relevant plan.

- **Stack**: Next.js 16 (App Router), React 19, TypeScript, Tailwind
  CSS v4, Supabase (`@supabase/ssr`), Vitest + jsdom, Google Gemini
  (`@google/generative-ai`), KaTeX / `react-katex`, Framer Motion,
  Recharts, lucide-react.
- **Types**: `any` is forbidden. Use `unknown` with type guards when
  the type is genuinely uncertain. Shared types live in
  `src/types/`.
- **Supabase clients**: Browser code uses
  `getSupabaseBrowserClient()`. Server Components and Route
  Handlers use `createSupabaseServerClient()`. Middleware uses
  `createServerClient` directly. No other patterns.
- **Comments**: Comments explain non-obvious intent, trade-offs, or
  constraints. Narrating obvious code is forbidden.
- **Math rendering**: Use `react-katex`. `dangerouslySetInnerHTML`
  for math (or any other untrusted content) is forbidden.

## Development Workflow & Quality Gates

Every change to the repository MUST pass these gates before merge:

1. **Spec-first for non-trivial work**: Features beyond a small
   bug fix or copy tweak MUST flow through the Spec Kit workflow
   (`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
   `/speckit-implement`). Each plan's Constitution Check MUST
   reference this document.
2. **Tests**: Pure utilities in `src/lib/` MUST have Vitest
   coverage. New role-protected route handlers MUST have at least
   one test that asserts both the unauthorized and authorized
   paths, with Supabase and external APIs mocked via `vi.mock()`.
   Test files live next to the source as `*.test.ts`.
3. **Local verification**: PR authors MUST run `npm run lint` and
   `npm test` locally and fix issues before requesting review.
4. **Migrations**: Any DB change is a new file under
   `supabase/migrations/`, reviewed alongside the code that uses
   it.
5. **Review**: Every PR MUST be reviewed against the five Core
   Principles above. Reviewers explicitly check English-only
   surface (I), UX impact (II), performance/concurrency impact
   (III), curriculum alignment (IV), and auth/data scope (V).
6. **Definition of Done**: A change is done when it is merged,
   migrations are applied, user-facing copy is in English, and
   regressions on the core student and teacher flows have been
   sanity-checked.

## Governance

- This constitution supersedes informal conventions and prior ad-hoc
  guidelines. Where it conflicts with `AGENTS.md`, `CLAUDE.md`, or
  `.cursorrules`, this document wins; the others MUST be reconciled
  in the same change.
- **Amendments**: Any contributor MAY propose an amendment via PR
  that edits this file. The PR MUST include: the proposed change,
  the rationale, the version bump and reasoning, and an updated
  Sync Impact Report at the top of this file.
- **Versioning policy** (semantic):
  - **MAJOR**: A principle is removed or redefined in a backward-
    incompatible way, or governance rules change materially.
  - **MINOR**: A new principle or section is added, or existing
    guidance is materially expanded.
  - **PATCH**: Wording, typos, clarifications, or non-semantic
    refinements.
- **Compliance review**: At least once per release cycle (or
  quarterly, whichever comes first), a maintainer audits open PRs
  and recently merged changes against the Core Principles and
  files follow-ups for any drift.
- **Runtime guidance**: Day-to-day implementation guidance for
  agents and contributors lives in `AGENTS.md`, `CLAUDE.md`, and
  `.cursorrules`. Those files MUST stay consistent with this
  constitution.

**Version**: 1.1.0 | **Ratified**: 2026-05-24 | **Last Amended**: 2026-05-24
