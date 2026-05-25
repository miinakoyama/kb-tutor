# Tasks: Dark Mode

**Input**: Design documents from `/specs/001-dark-mode/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1, US2, US3)
- Every task includes exact file path(s)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database schema change required for cross-device persistence (US3)

- [X] T001 Add `appearance_mode` column migration in `supabase/migrations/YYYYMMDDHHMMSS_user_settings_appearance_mode.sql` per `specs/001-dark-mode/data-model.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core theme infrastructure that MUST complete before user story work

**⚠️ CRITICAL**: No user story phase can begin until this phase is complete

- [X] T002 Implement appearance preference module (`normalizeAppearanceMode`, `getStoredAppearanceMode`, `setStoredAppearanceMode`, `saveAppearanceModeToDb`, `syncAppearanceFromDb`, `migrateAppearanceOnce`, `resolveTheme`) in `src/lib/appearance-settings.ts` per `specs/001-dark-mode/contracts/appearance-preference.md`
- [X] T003 Add Vitest unit tests for normalization, defaults, invalid values, and `resolveTheme` in `src/lib/appearance-settings.test.ts`
- [X] T004 Define light/dark CSS variable tokens, `.dark` overrides, and Tailwind dark variant in `src/app/globals.css` per `specs/001-dark-mode/contracts/theme-resolution.md`
- [X] T005 Create `ThemeProvider` with theme context, DOM class application, and `prefers-color-scheme` listener in `src/components/ThemeProvider.tsx`
- [X] T006 Add inline FOUC-prevention script and wrap app with `ThemeProvider` in `src/app/layout.tsx`
- [X] T007 Register `migrateAppearanceOnce()` in `src/components/MigrationBootstrap.tsx`

**Checkpoint**: Theme resolves and applies on page load; preference module tested — user story work can begin

---

## Phase 3: User Story 2 - Sensible Default on First Visit (Priority: P1) 🎯

**Goal**: First-time visitors see the correct theme (System default matching OS) on all entry pages without visiting Settings, with no visible wrong-theme flash

**Independent Test**: Clear `localStorage['kb-tutor-appearance-mode']`, open `/login` on a device in dark mode — page renders dark immediately; change OS theme while on System mode — app updates without refresh

### Implementation for User Story 2

- [X] T008 [P] [US2] Replace hardcoded light-only colors with semantic tokens in `src/components/AppChrome.tsx`
- [X] T009 [P] [US2] Replace hardcoded light-only colors with semantic tokens in `src/components/Sidebar.tsx`
- [X] T010 [P] [US2] Replace hardcoded light-only colors with semantic tokens in `src/app/login/page.tsx`
- [X] T011 [P] [US2] Replace hardcoded light-only colors with semantic tokens in `src/app/login/staff/page.tsx`
- [X] T012 [US2] Update root body background class in `src/app/layout.tsx` to use theme-aware token instead of hardcoded `bg-sand-beige`

**Checkpoint**: Login and app shell readable in both resolved themes; first-visit System default verified

---

## Phase 4: User Story 1 - Choose Appearance in Settings (Priority: P1)

**Goal**: Signed-in users change appearance (System / Light / Dark) from Settings and see the entire app update instantly without reload

**Independent Test**: Open `/settings`, select Dark — sidebar, cards, and navigation switch immediately; navigate to practice and teacher dashboard — theme stays consistent

### Implementation for User Story 1

- [X] T013 [US1] Add Appearance section with segmented System/Light/Dark control wired to `ThemeProvider` in `src/app/settings/page.tsx`
- [X] T014 [P] [US1] Migrate student home surface colors in `src/app/page.tsx` and `src/components/HomePageContent.tsx`
- [X] T015 [P] [US1] Migrate practice flow colors in `src/app/practice/page.tsx`, `src/components/PracticePageClient.tsx`, `src/components/MCQEngine.tsx`, and `src/components/ModeSelector.tsx`
- [X] T016 [P] [US1] Migrate review/adaptive mode colors in `src/components/modes/ReviewMode.tsx` and `src/components/modes/AdaptivePracticeMode.tsx`
- [X] T017 [P] [US1] Migrate exam mode colors in `src/app/exam/page.tsx` and `src/components/modes/ExamMode.tsx`
- [X] T018 [P] [US1] Migrate student utility pages in `src/app/progress/page.tsx`, `src/app/bookmarks/page.tsx`, `src/app/notifications/page.tsx`, and `src/app/self-practice/page.tsx`
- [X] T019 [P] [US1] Migrate self-practice and assignment student components in `src/components/SelfPracticePlanner.tsx`, `src/components/assignments/StudentAssignmentsList.tsx`, `src/components/assignments/ReviewScopePicker.tsx`, `src/components/assignments/QuestionDetails.tsx`, and `src/components/assignments/AssignmentProgressPanel.tsx`
- [X] T020 [P] [US1] Migrate teacher dashboard colors in `src/app/teacher-dashboard/page.tsx`
- [X] T021 [P] [US1] Migrate assignment management pages in `src/app/assignments/page.tsx`, `src/app/assignments/manage/page.tsx`, `src/app/assignments/manage/new/page.tsx`, `src/app/assignments/manage/[assignmentId]/page.tsx`, `src/app/assignments/[assignmentId]/history/page.tsx`, and `src/app/assignments/[assignmentId]/history/[attemptNumber]/page.tsx`
- [X] T022 [P] [US1] Migrate assignment editor components in `src/components/assignments/ManualQuestionEditor.tsx`, `src/components/assignments/ExistingSetPicker.tsx`, and `src/components/assignments/AllAssignmentsCompleteSelfPracticeModal.tsx`
- [X] T023 [P] [US1] Migrate admin content shell in `src/app/content/layout.tsx` and `src/app/content/page.tsx`
- [X] T024 [P] [US1] Migrate admin content pages in `src/app/content/questions/page.tsx`, `src/app/content/questions/[setId]/page.tsx`, `src/app/content/questions/new/manual/page.tsx`, `src/app/content/accounts/page.tsx`, `src/app/content/schools/page.tsx`, and `src/app/content/mass-production/page.tsx`
- [X] T025 [P] [US1] Migrate admin data-analysis pages in `src/app/content/data-analysis/page.tsx`, `src/app/content/data-analysis/tabs.tsx`, `src/app/content/data-analysis/students/page.tsx`, `src/app/content/data-analysis/questions/page.tsx`, `src/app/content/data-analysis/insights/page.tsx`, `src/app/content/data-analysis/feature-usage/page.tsx`, `src/app/content/data-analysis/date-range.tsx`, and `src/app/content/data-analysis/school-filter.tsx`
- [X] T026 [P] [US1] Migrate shared practice UI in `src/components/shared/QuestionDisplay.tsx`, `src/components/shared/OptionButton.tsx`, `src/components/shared/PracticeHeader.tsx`, `src/components/shared/FeedbackPanel.tsx`, `src/components/shared/ExamNavigator.tsx`, `src/components/shared/GlossaryPanel.tsx`, `src/components/shared/GlossaryPopover.tsx`, `src/components/shared/ReadAloudButton.tsx`, `src/components/shared/Timer.tsx`, `src/components/shared/ConfidenceCheck.tsx`, `src/components/shared/FeatureSpotlight.tsx`, and `src/components/shared/NextSessionCTA.tsx`
- [X] T027 [P] [US1] Migrate remaining shared components in `src/components/FeedbackDisplay.tsx`, `src/components/FirstLoginOnboarding.tsx`, `src/components/SyncStatusIndicator.tsx`, `src/components/TopicNavigation.tsx`, `src/components/StudentAvatar.tsx`, and `src/components/mass-production/QuestionPreviewCard.tsx`, `src/components/mass-production/QuestionEditModal.tsx`

**Checkpoint**: Settings control works; all primary surfaces readable in light and dark resolved themes

---

## Phase 5: User Story 3 - Remember Preference Across Sessions (Priority: P2)

**Goal**: Signed-in users retain appearance choice across browser restarts and sync it across devices

**Independent Test**: Set Dark in Settings, sign out, sign back in — Dark persists; set Dark on one browser, sign in on another — Dark applied after sync

### Implementation for User Story 3

- [X] T028 [US3] Load and sync appearance from DB on Settings mount via `syncAppearanceFromDb()` in `src/app/settings/page.tsx`
- [X] T029 [US3] Ensure `migrateAppearanceOnce()` pushes local preference to DB and `syncAppearanceFromDb()` repopulates localStorage after storage clear in `src/lib/appearance-settings.ts` and `src/components/MigrationBootstrap.tsx`

**Checkpoint**: Cross-session and cross-device persistence verified per US3 acceptance scenarios

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Diagram/chart legibility, QA, and quality gates

- [X] T030 [P] Add dark-mode KaTeX and diagram contrast overrides in `src/app/globals.css` and migrate diagram components in `src/components/diagrams/BarChartDiagram.tsx`, `src/components/diagrams/LineChartDiagram.tsx`, `src/components/diagrams/FlowchartDiagram.tsx`, `src/components/diagrams/SvgDiagram.tsx`, and `src/components/diagrams/TableDiagram.tsx`
- [X] T031 [P] Pass theme-aware stroke/fill colors to Recharts instances in `src/app/teacher-dashboard/page.tsx` and admin data-analysis chart pages under `src/app/content/data-analysis/`
- [X] T032 Run manual QA checklist in `specs/001-dark-mode/quickstart.md` and fix any contrast or legibility issues found
- [X] T033 Run `npm run lint` and `npm test`; fix any failures introduced by dark mode changes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on T001 — **BLOCKS all user stories**
- **Phase 3 (US2)**: Depends on Phase 2 — first-visit/login experience
- **Phase 4 (US1)**: Depends on Phase 2; benefits from Phase 3 shell/login but Settings UI (T013) can start after Phase 2
- **Phase 5 (US3)**: Depends on T002, T007, T013 — persistence wiring after Settings UI exists
- **Phase 6 (Polish)**: Depends on Phases 3–5

### User Story Dependencies

| Story | Priority | Depends on | Notes |
|-------|----------|------------|-------|
| US2 | P1 | Foundational | First-visit + login; no Settings required |
| US1 | P1 | Foundational | Settings + full surface migration |
| US3 | P2 | US1 T013 + Foundational | DB sync on Settings load |

US1 and US2 can partially overlap after Foundational: US2 shell/login (T008–T012) parallel with US1 migrations (T014–T027).

### Within Each User Story

- Foundational module (T002) before tests (T003) and provider (T005)
- T013 Settings UI before T028 DB sync on Settings mount
- Component migrations ([P] tasks) can run in parallel within US1

### Parallel Opportunities

- **Phase 3**: T008, T009, T010, T011 in parallel
- **Phase 4**: T014–T027 in parallel (14 parallel tracks by surface area)
- **Phase 6**: T030, T031 in parallel

---

## Parallel Example: User Story 1

```bash
# After T013 (Settings UI), launch surface migrations in parallel:
Task T014: "Migrate student home in src/app/page.tsx and src/components/HomePageContent.tsx"
Task T015: "Migrate practice flow in src/app/practice/page.tsx, src/components/PracticePageClient.tsx, ..."
Task T020: "Migrate teacher dashboard in src/app/teacher-dashboard/page.tsx"
Task T023: "Migrate admin content shell in src/app/content/layout.tsx and src/app/content/page.tsx"
Task T026: "Migrate shared practice UI in src/components/shared/*.tsx"
```

---

## Parallel Example: User Story 2

```bash
# After Phase 2 completes, launch login/shell migrations together:
Task T008: "Migrate src/components/AppChrome.tsx"
Task T009: "Migrate src/components/Sidebar.tsx"
Task T010: "Migrate src/app/login/page.tsx"
Task T011: "Migrate src/app/login/staff/page.tsx"
```

---

## Implementation Strategy

### MVP First (User Stories 2 + 1 core)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T007) — **CRITICAL**
3. Complete Phase 3: US2 shell/login (T008–T012)
4. Complete T013: Settings Appearance section
5. Migrate highest-traffic student surfaces (T014–T017)
6. **STOP and VALIDATE**: Settings change + practice flow in both themes
7. Continue remaining US1 migrations (T018–T027)

### Incremental Delivery

1. Setup + Foundational → theme engine works
2. US2 shell/login → first-visit experience correct
3. US1 Settings + student flows → MVP for students
4. US1 teacher/admin/shared → full FR-007 coverage
5. US3 persistence → cross-device sync
6. Polish → charts, KaTeX, QA

### Parallel Team Strategy

With multiple developers after Phase 2:

- **Dev A**: US2 shell/login (T008–T012)
- **Dev B**: Settings UI (T013) then student pages (T014–T019)
- **Dev C**: Teacher + admin pages (T020–T025)
- **Dev D**: Shared components (T026–T027)

---

## Notes

- v1: Settings-only control — **no** sidebar/header quick toggle
- **No** per-screen theme exceptions
- All UI strings in English (Appearance, System, Light, Dark)
- Prefer semantic CSS tokens over ad-hoc `dark:` pairs where possible
- Commit after each task or logical batch
- Total tasks: **33** (Setup: 1, Foundational: 6, US2: 5, US1: 15, US3: 2, Polish: 4)
