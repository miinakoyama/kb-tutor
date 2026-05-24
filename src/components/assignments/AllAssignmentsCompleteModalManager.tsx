"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AllAssignmentsCompleteSelfPracticeModal } from "@/components/assignments/AllAssignmentsCompleteSelfPracticeModal";
import {
  computeNextShownForCurrentCompletion,
  readStoredIncompleteAssignmentCount,
  shouldOpenAllAssignmentsCompleteModal,
  subscribeToAllAssignmentsCompleted,
  writeStoredIncompleteAssignmentCount,
} from "@/lib/all-assignments-complete-modal";

type CompletionStatusResponse = {
  is_student?: unknown;
  student_user_id?: unknown;
  incomplete_assignments?: unknown;
  total_assignments?: unknown;
  all_assignments_completed?: unknown;
};

// Pages where the "all assignments complete, go to Self Practice" modal is
// suppressed. The modal exists to *push* the student toward Self Practice;
// if they are already on the Self Practice page itself (or arrived there
// via the post-session NextSessionCTA), surfacing the same suggestion on
// top of it is redundant and confusing.
const SUPPRESS_MODAL_PATHS = new Set<string>([
  "/login",
  "/login/staff",
  "/self-practice",
]);

function shouldSuppressForPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return SUPPRESS_MODAL_PATHS.has(pathname);
}

export function AllAssignmentsCompleteModalManager() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const alreadyShownForCurrentCompletionRef = useRef(false);
  // Read at emit-time inside the subscribe-driven listener so a stale
  // closure cannot reopen the modal once the student navigates somewhere
  // we suppress it on. Updated on every render below.
  const pathnameRef = useRef<string | null>(pathname);

  const syncFromServer = useCallback(async () => {
    // Note: we deliberately do NOT bail out early on suppressed paths.
    // We still need to fetch and persist the latest incomplete count so
    // that previousIncomplete stays in sync — otherwise a student who
    // completes their last assignment on a suppressed route (e.g.
    // lands on /self-practice and reloads) would keep a stale "> 0"
    // stored count, and the modal could later open on a non-suppressed
    // page for the *same* completion event. We only skip opening the
    // modal UI itself on suppressed paths.
    const suppressOpen = shouldSuppressForPath(pathname);

    try {
      const res = await fetch("/api/assignments/completion-status", {
        cache: "no-store",
      });
      if (!res.ok) return;

      const body = (await res.json()) as CompletionStatusResponse;
      if (body.is_student !== true) return;
      if (typeof body.student_user_id !== "string" || !body.student_user_id.trim()) {
        return;
      }
      if (typeof body.incomplete_assignments !== "number") return;
      if (typeof body.total_assignments !== "number") return;
      const currentIncomplete = body.incomplete_assignments;
      const totalAssignments = body.total_assignments;
      if (!Number.isFinite(currentIncomplete) || currentIncomplete < 0) return;
      if (!Number.isFinite(totalAssignments) || totalAssignments < 0) return;

      const previousIncomplete = readStoredIncompleteAssignmentCount(
        body.student_user_id,
      );
      const wouldOpen = shouldOpenAllAssignmentsCompleteModal({
        previousIncomplete,
        currentIncomplete,
        totalAssignments,
        allAssignmentsCompleted: body.all_assignments_completed === true,
        alreadyShownForCurrentCompletion:
          alreadyShownForCurrentCompletionRef.current,
      });
      const openedModalNow = wouldOpen && !suppressOpen;
      if (openedModalNow) {
        setOpen(true);
      }
      // When suppressed, treat the completion as already-shown so the
      // modal won't reopen for the same completion event after the
      // student navigates to a non-suppressed page.
      alreadyShownForCurrentCompletionRef.current =
        computeNextShownForCurrentCompletion({
          currentIncomplete,
          alreadyShownForCurrentCompletion:
            alreadyShownForCurrentCompletionRef.current,
          openedModalNow: wouldOpen,
        });

      writeStoredIncompleteAssignmentCount(
        body.student_user_id,
        currentIncomplete,
      );
    } catch {
      // best-effort only
    }
  }, [pathname]);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    void syncFromServer();
  }, [syncFromServer]);

  useEffect(() => {
    const unsubscribe = subscribeToAllAssignmentsCompleted(() => {
      // Honor the same suppression as syncFromServer: a learner who is
      // already on Self Practice (e.g. arrived via NextSessionCTA right
      // after the final completion) doesn't need a second "go to Self
      // Practice" prompt on top of the page they're already on.
      if (shouldSuppressForPath(pathnameRef.current)) {
        // Still record that the modal "would have shown" for this
        // completion so subsequent syncFromServer calls (which might run
        // when the learner navigates elsewhere later) don't reopen it
        // for the same completion event.
        alreadyShownForCurrentCompletionRef.current = true;
        return;
      }
      alreadyShownForCurrentCompletionRef.current = true;
      setOpen(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const onWindowFocus = () => {
      void syncFromServer();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncFromServer();
      }
    };

    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [syncFromServer]);

  return (
    <AllAssignmentsCompleteSelfPracticeModal
      open={open}
      onDismiss={() => setOpen(false)}
    />
  );
}
