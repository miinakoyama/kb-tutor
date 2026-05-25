"use client";

import type { AppRole } from "@/lib/auth/types";

interface QuestionDetailDrawerProps {
  // Will be used in Phase 5 to render an admin-only scope toggle.
  role: AppRole;
}

/**
 * Stub mounted by the Standard drill-down and Student profile pages.
 * The real drawer (User Story 3) ships in Phase 5 of the spec-kit
 * implementation plan — until then, this component renders nothing.
 *
 * The mount point exists now so the surrounding pages do not need a
 * later refactor when the drawer goes live; opening `?question=<id>` is
 * a no-op for now.
 */
export function QuestionDetailDrawer(props: QuestionDetailDrawerProps) {
  void props.role;
  return null;
}
