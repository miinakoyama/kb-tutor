# Data Model: Dark Mode

**Feature**: `001-dark-mode`  
**Date**: 2026-05-25

## Overview

Dark mode adds one persisted user preference field and two derived runtime concepts. No new tables.

## Entities

### Appearance preference (persisted)

| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `appearance_mode` | `text` | `IN ('system', 'light', 'dark')` | `'system'` |

**Location**: `public.user_settings.appearance_mode`  
**Owner**: Authenticated user (`user_id` PK, FK → `profiles.id`)  
**RLS**: Existing `user_settings_self_all` policy (read/write own row; admin override)

**Local mirror**:

| Key | Value |
|-----|-------|
| `localStorage['kb-tutor-appearance-mode']` | `'system'` \| `'light'` \| `'dark'` |

### Resolved theme (derived, not stored)

| Field | Type | Values |
|-------|------|--------|
| `resolvedTheme` | enum | `'light'` \| `'dark'` |

**Derivation rules**:

```
if appearance_mode == 'light'  → resolvedTheme = 'light'
if appearance_mode == 'dark'   → resolvedTheme = 'dark'
if appearance_mode == 'system'  → resolvedTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
```

**DOM effect**: `document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')`

## Relationships

```text
profiles (1) ──< user_settings (1)
                      │
                      └── appearance_mode  (optional column, default system)
```

## Validation rules

| Rule | Enforcement |
|------|-------------|
| V-001 | `appearance_mode` MUST be one of `system`, `light`, `dark` | DB `CHECK` constraint + TS union type + normalizer in `appearance-settings.ts` |
| V-002 | Unknown localStorage value → treat as `system` | Client normalizer |
| V-003 | NULL in DB → treat as `system` | Client/server read fallback |
| V-004 | Invalid write attempts ignored | Normalizer coerces to default before upsert |

## State transitions

```text
[no preference] ──first visit──▶ system (default)
system ──user selects light──▶ light
system ──user selects dark──▶ dark
light ──user selects system──▶ system
dark ──user selects system──▶ system
light ◀──user selects dark──▶ dark
```

Each transition:

1. Updates localStorage immediately
2. Updates DOM class immediately (no reload)
3. Upserts `user_settings.appearance_mode` asynchronously when authenticated

## Migration

**File**: `supabase/migrations/YYYYMMDDHHMMSS_user_settings_appearance_mode.sql`

```sql
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS appearance_mode text NOT NULL DEFAULT 'system'
  CHECK (appearance_mode IN ('system', 'light', 'dark'));

COMMENT ON COLUMN public.user_settings.appearance_mode IS
  'User appearance preference: system (follow OS), light, or dark.';
```

## Unchanged entities

- No changes to `profiles`, sessions, questions, assignments, or auth tables.
- No third-party data transmission (Constitution V compliant).
