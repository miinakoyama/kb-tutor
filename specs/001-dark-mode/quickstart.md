# Quickstart: Dark Mode Development

**Feature**: `001-dark-mode`  
**Branch**: `001-dark-mode`

## Prerequisites

- Node.js 22.x, npm
- Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- Migration applied for `user_settings.appearance_mode`

## Key files (to be created/modified)

| Path | Purpose |
|------|---------|
| `src/lib/appearance-settings.ts` | Preference read/write, normalization, DB sync |
| `src/lib/appearance-settings.test.ts` | Unit tests |
| `src/components/ThemeProvider.tsx` | Client theme application + system listener |
| `src/app/layout.tsx` | Inline FOUC script + ThemeProvider wrapper |
| `src/app/globals.css` | Light/dark CSS variable tokens + Tailwind dark variant |
| `src/app/settings/page.tsx` | Appearance section UI |
| `src/components/MigrationBootstrap.tsx` | One-time appearance migration hook |
| `supabase/migrations/*_user_settings_appearance_mode.sql` | DB column |

## Local development

```bash
# Install (if needed)
npm install

# Apply migration to hosted Supabase (project-specific tooling)
# Then start dev server
npm run dev
```

Open http://localhost:3000/login — page should match OS theme when no preference is saved.

## Manual verification checklist

### P1 — Settings control

- [ ] Navigate to `/settings` → **Appearance** section visible with System, Light, Dark
- [ ] Select **Dark** → entire app (sidebar, main, cards) switches without reload
- [ ] Select **Light** → returns to light palette
- [ ] Select **System** → matches current OS light/dark setting

### P1 — First visit / login

- [ ] Clear `localStorage['kb-tutor-appearance-mode']` → reload `/login`
- [ ] No visible flash of wrong theme before content appears
- [ ] Resolved theme matches OS preference

### P1 — System live update

- [ ] Set preference to **System**
- [ ] Change OS appearance (macOS: System Settings → Appearance; Windows: Settings → Personalization)
- [ ] App updates within 1s without refresh

### P2 — Persistence

- [ ] Signed in → set **Dark** → sign out → sign in → still **Dark**
- [ ] Set **Dark** on browser A → sign in on browser B → **Dark** applied after sync

### Cross-surface smoke (both resolved themes)

- [ ] `/login` — form readable
- [ ] `/` or home — cards and navigation readable
- [ ] Practice / Review / Exam — question text, options, feedback readable
- [ ] `/teacher-dashboard` — charts and tables readable
- [ ] `/content` (admin) — data tables readable
- [ ] KaTeX math and diagrams remain legible

### Regression

- [ ] Time zone and TTS settings still save correctly
- [ ] `npm run lint` passes
- [ ] `npm test` passes (including new appearance-settings tests)

## Debugging tips

```javascript
// Browser console
localStorage.getItem('kb-tutor-appearance-mode')
document.documentElement.classList.contains('dark')
window.matchMedia('(prefers-color-scheme: dark)').matches
```

## Out of scope for v1 (do not test as requirements)

- Sidebar/header quick theme toggle
- Per-page theme overrides (e.g., Exam-only dark)
- Custom accent colors
