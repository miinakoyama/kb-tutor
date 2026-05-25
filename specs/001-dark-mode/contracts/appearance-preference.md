# Contract: Appearance Preference

**Feature**: `001-dark-mode`  
**Type**: Client storage + Supabase row field  
**Version**: 1.0

## Values

| Value | Meaning |
|-------|---------|
| `system` | Follow device/browser `prefers-color-scheme` (default) |
| `light` | Force light theme |
| `dark` | Force dark theme |

## Local storage contract

| Property | Value |
|----------|-------|
| Key | `kb-tutor-appearance-mode` |
| Format | Plain string enum |
| Default (missing/invalid) | `system` |
| Write timing | Synchronous on user selection |
| SSR | Not accessed server-side; guarded with `typeof window !== "undefined"` |

## Database contract

| Property | Value |
|----------|-------|
| Table | `public.user_settings` |
| Column | `appearance_mode` |
| Type | `text NOT NULL DEFAULT 'system'` |
| Constraint | `CHECK (appearance_mode IN ('system', 'light', 'dark'))` |
| Upsert key | `user_id` (via Supabase auth session) |
| Read scope | Own row only (RLS) |

## Module API (`src/lib/appearance-settings.ts`)

```typescript
export type AppearanceMode = "system" | "light" | "dark";
export const DEFAULT_APPEARANCE_MODE: AppearanceMode = "system";
export const APPEARANCE_STORAGE_KEY = "kb-tutor-appearance-mode";

export function normalizeAppearanceMode(value: unknown): AppearanceMode;
export function getStoredAppearanceMode(fallback?: AppearanceMode): AppearanceMode;
export function setStoredAppearanceMode(mode: AppearanceMode): void;
export async function saveAppearanceModeToDb(mode: AppearanceMode): Promise<void>;
export async function syncAppearanceFromDb(fallback?: AppearanceMode): Promise<AppearanceMode>;
export async function migrateAppearanceOnce(): Promise<void>;
export function resolveTheme(mode: AppearanceMode, prefersDark: boolean): "light" | "dark";
```

## Error handling

| Condition | Behavior |
|-----------|----------|
| localStorage unavailable | Use in-memory default `system` for session |
| Supabase upsert fails | Keep local value; retry on next explicit save or migration bootstrap |
| DB read fails | Fall back to localStorage; if absent, `system` |
| Invalid stored value | Coerce to `system` |

## UI contract (Settings page)

| Element | Requirement |
|---------|-------------|
| Section title | `Appearance` |
| Helper text | English explanation that System follows device settings |
| Control | Segmented group with three options: `System`, `Light`, `Dark` |
| Labels | English only (Constitution I) |
| Change latency | Visual update ≤ 1s (SC-002) |
| Location | `/settings` only in v1 — no chrome toggle |
