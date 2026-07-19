---
name: design-system
description: Apply and audit the kb-tutor visual design system for student assignment flows, short-answer UI, shared app chrome, and dense teacher/admin surfaces. Use whenever creating, editing, or reviewing UI components, layouts, styles, design tokens, responsive states, dark mode, or interaction styling in this repository.
---

# kb-tutor Design System

Before changing or reviewing UI, read
`../../../.cursor/skills/design-system/SKILL.md` completely. Treat that file as
the canonical palette, typography, spacing, radius, shadow, border, icon,
component-pattern, motion, admin-tier, and anti-pattern reference.

## Workflow

1. Inspect the target component and its nearest established visual peers.
2. Identify the relevant student, assignment, or admin density tier from the canonical reference.
3. Reuse existing CSS variables and component patterns. Do not invent tokens, radii, colors, shadows, icons, or Tailwind aliases when the reference already defines the choice.
4. Keep all user-facing copy in English and preserve keyboard, screen-reader, responsive, and light/dark-mode behavior.
5. Check the final diff against the canonical Anti-patterns section and run focused UI tests plus lint/type checking as appropriate.

If the canonical Cursor skill changes, follow the updated source rather than
copying stale values into this wrapper.
