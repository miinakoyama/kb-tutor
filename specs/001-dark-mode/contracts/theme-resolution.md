# Contract: Theme Resolution & DOM Application

**Feature**: `001-dark-mode`  
**Type**: Client runtime behavior  
**Version**: 1.0

## Inputs

| Input | Source |
|-------|--------|
| `appearanceMode` | `getStoredAppearanceMode()` or Settings user action |
| `prefersDark` | `window.matchMedia('(prefers-color-scheme: dark)').matches` |

## Output

| Output | Target |
|--------|--------|
| `resolvedTheme: 'light' \| 'dark'` | Derived; not persisted |
| DOM class `dark` on `<html>` | Present iff `resolvedTheme === 'dark'` |

## Resolution function

```
resolveTheme(mode, prefersDark):
  if mode == 'light': return 'light'
  if mode == 'dark':  return 'dark'
  return prefersDark ? 'dark' : 'light'
```

## Application points

### 1. Inline bootstrap script (`layout.tsx`)

- Runs synchronously before first paint
- Reads `localStorage['kb-tutor-appearance-mode']`
- Applies `dark` class on `<html>`
- Uses same resolution rules; if `matchMedia` unavailable → `light`

### 2. ThemeProvider (client)

- Re-applies class on mount (handles hydration consistency)
- Subscribes to `prefers-color-scheme` changes when `appearanceMode === 'system'`
- Exposes context: `{ appearanceMode, resolvedTheme, setAppearanceMode }` for Settings page
- Cleans up media query listener on unmount/mode change

## CSS token contract

Light tokens defined on `:root`; dark overrides on `.dark` (or `:root.dark`):

| Token | Light (existing) | Dark (new) |
|-------|------------------|------------|
| `--background` | `#f0f4f1` | TBD (~`#0f1a12`) |
| `--foreground` | `#1f2d1f` | TBD (~`#e8f0ea`) |
| `--surface` | `#ffffff` | TBD (~`#1a2e1f`) |
| `--border-default` | rgba light | TBD darker variant |
| Primary greens | `#16a34a` family | Adjusted for contrast on dark surfaces |

Tailwind `@theme inline` maps semantic colors to these variables so components using `bg-background`, `text-foreground`, etc. inherit automatically.

## Component styling rules

1. Prefer semantic tokens over hardcoded hex in new/edited code.
2. Use `dark:` variant only when a component needs an exception to token defaults.
3. Interactive states (hover, focus, disabled) MUST be verified in both resolved themes.
4. No per-route theme exceptions in v1.

## Events

| Event | Action |
|-------|--------|
| User selects mode in Settings | Update storage → resolve → apply class → upsert DB |
| OS theme changes (system mode) | Re-resolve → apply class |
| Sign-in after local-only usage | `syncAppearanceFromDb()` may overwrite local with remote |

## Accessibility contract

- WCAG 2.1 AA contrast for body text and controls in both themes (Constitution II)
- Focus rings visible in dark mode (`focus-visible:ring-*` using theme-aware colors)
- No information conveyed by color alone without secondary indicator (existing behavior preserved)
