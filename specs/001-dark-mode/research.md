# Research: Dark Mode

**Feature**: `001-dark-mode`  
**Date**: 2026-05-25

## R1 — Theme application mechanism

**Decision**: Apply resolved theme by toggling a `dark` class on the root `<html>` element and drive colors through CSS custom properties defined in `src/app/globals.css`.

**Rationale**:

- The project already centralizes palette tokens in `:root` and `@theme inline` (`globals.css`). Extending this with a `.dark` override block keeps Tailwind v4 integration simple.
- Class-based dark mode works for all three preference modes: `light` and `dark` force the class; `system` sets/removes the class based on `prefers-color-scheme`.
- Matches common Next.js App Router patterns and avoids adding a new dependency (e.g., `next-themes`).

**Alternatives considered**:

| Alternative | Rejected because |
|-------------|------------------|
| `next-themes` library | Adds dependency for logic we can implement in ~100 lines following existing settings patterns |
| `prefers-color-scheme` media queries only (no class) | Cannot honor explicit Light/Dark user overrides independently of OS |
| Per-component inline styles | 70+ files use hardcoded light colors; unmaintainable without tokens |
| `data-theme` attribute instead of class | Either works; `dark` class aligns with Tailwind `dark:` variant conventions |

---

## R2 — FOUC (flash of wrong theme) prevention

**Decision**: Inject a small inline blocking script in `src/app/layout.tsx` (before React hydration) that reads `localStorage`, resolves `system → light|dark`, and sets the `dark` class on `<html>` immediately.

**Rationale**:

- Spec requires avoiding visible wrong-theme flash on first paint (edge case in spec).
- Client-only `useEffect` in a provider runs too late (after first paint).
- Script mirrors the same resolution logic exported from `src/lib/appearance-settings.ts` (shared constants; logic duplicated minimally in inline script as string).

**Alternatives considered**:

| Alternative | Rejected because |
|-------------|------------------|
| Server-rendered theme from cookie | Adds cookie plumbing; localStorage is already the fast path for other prefs |
| Accept FOUC for v1 | Violates spec edge case and poor UX on login at night |

---

## R3 — Preference persistence

**Decision**: Mirror the existing `timezone-settings.ts` / `tts-settings.ts` hybrid pattern:

- **Local**: `localStorage` key `kb-tutor-appearance-mode`
- **Remote**: new `user_settings.appearance_mode` column (`system` | `light` | `dark`, default `system`)
- **Sync**: `syncAppearanceFromDb()` on Settings load; `setStoredAppearance()` writes local + upserts DB; one-time migration in `MigrationBootstrap`

**Rationale**:

- Proven pattern in this codebase; satisfies FR-008/FR-009.
- `user_settings` already has RLS policy `user_settings_self_all` — no new auth surface.
- Signed-in users get cross-device sync; unsigned login page uses local default `system`.

**Alternatives considered**:

| Alternative | Rejected because |
|-------------|------------------|
| localStorage only | Fails FR-008 cross-device requirement |
| Profile metadata JSON | Less queryable; inconsistent with time_zone / tts_rate columns |
| Separate `appearance_preferences` table | Over-normalized for a single enum field |

---

## R4 — Settings UI control pattern

**Decision**: Add an **Appearance** section on `/settings` with a three-option segmented button group (System / Light / Dark). No sidebar or header quick toggle in v1 (confirmed by product owner).

**Rationale**:

- Matches FR-003/FR-004 and existing Settings section layout (Read Aloud, Time Zone).
- Segmented control exposes all three options simultaneously — clearer than a two-state toggle for students/teachers (Constitution II: clarity).
- Product owner explicitly declined quick-toggle in chrome for v1.

**Alternatives considered**:

| Alternative | Rejected because |
|-------------|------------------|
| Binary Light/Dark toggle | Hides System option; conflicts with spec default |
| Header icon toggle | Out of scope per product owner confirmation |
| Dropdown select | Works but less scannable than segmented control for three fixed options |

---

## R5 — System mode live updates

**Decision**: When preference is `system`, register a `matchMedia('(prefers-color-scheme: dark)')` listener in a client `ThemeProvider` to update the resolved class when OS theme changes.

**Rationale**:

- Satisfies User Story 2 acceptance scenario 2 without page reload.
- Listener is cheap; only active when mode is `system`.

**Alternatives considered**:

| Alternative | Rejected because |
|-------------|------------------|
| Require manual refresh | Violates spec |
| Poll on interval | Wasteful vs. native media query events |

---

## R6 — Component color migration strategy

**Decision**: Two-layer approach:

1. **Token layer**: Expand CSS variables in `globals.css` for light and `.dark` (background, foreground, surface, border, muted text, primary greens).
2. **Component layer**: Sweep ~70 TSX files replacing hardcoded light-only classes (`bg-white`, `text-[#14532d]`, `border-[#16a34a]/30`, etc.) with semantic tokens and/or `dark:` Tailwind variants.

**Rationale**:

- Grep shows widespread hardcoded palette usage across student, teacher, and admin surfaces.
- Token-first reduces repeated `dark:` pairs; `dark:` still needed for one-off cases (charts, diagrams).
- No per-page exceptions (confirmed by product owner).

**Alternatives considered**:

| Alternative | Rejected because |
|-------------|------------------|
| Settings page only | Violates FR-007 full-surface requirement |
| Replace colors incrementally post-release | Would ship broken contrast on most pages |

**Migration order** (implementation priority):

1. Shell: `layout.tsx`, `AppChrome`, `Sidebar`
2. Auth: `login/page.tsx`, `login/staff/page.tsx`
3. Settings + student home/practice flows
4. Teacher dashboard + assignments
5. Admin content/analytics pages
6. Shared components, modals, diagrams (Recharts/KaTeX contrast)

---

## R7 — KaTeX, Recharts, and diagrams

**Decision**:

- **KaTeX**: Rely on inherited foreground color; add `.dark` overrides for KaTeX default black elements if needed via CSS in `globals.css`.
- **Recharts**: Pass theme-aware stroke/fill props derived from CSS variables or a small `useResolvedTheme()` hook.
- **SVG diagrams**: Use `currentColor` or CSS variable fills where hardcoded greens exist.

**Rationale**: Constitution requires KaTeX without `dangerouslySetInnerHTML`; charts must stay legible per spec edge cases.

---

## R8 — Testing approach

**Decision**:

- Unit tests for `appearance-settings.ts`: normalization, default, invalid values, resolution (`system` + mocked `matchMedia`).
- No new API route required (direct Supabase upsert like timezone).
- Manual QA checklist in `quickstart.md` covering login, settings change, cross-page navigation, OS theme change.

**Rationale**: Constitution mandates Vitest for `src/lib/` utilities; theme is primarily client-side.

---

## R9 — Legacy browser fallback

**Decision**: If `prefers-color-scheme` is unavailable, treat `system` as `light`.

**Rationale**: Documented assumption in spec; safe default for classroom Chromebooks on older builds.
