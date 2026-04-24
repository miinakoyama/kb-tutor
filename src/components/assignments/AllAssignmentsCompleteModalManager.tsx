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

export function AllAssignmentsCompleteModalManager() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const alreadyShownForCurrentCompletionRef = useRef(false);

  const syncFromServer = useCallback(async () => {
    if (pathname === "/login" || pathname === "/login/staff") return;

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
      const shouldOpen = shouldOpenAllAssignmentsCompleteModal({
        previousIncomplete,
        currentIncomplete,
        totalAssignments,
        allAssignmentsCompleted: body.all_assignments_completed === true,
        alreadyShownForCurrentCompletion:
          alreadyShownForCurrentCompletionRef.current,
      });
      if (shouldOpen) {
        setOpen(true);
      }
      alreadyShownForCurrentCompletionRef.current =
        computeNextShownForCurrentCompletion({
          currentIncomplete,
          alreadyShownForCurrentCompletion:
            alreadyShownForCurrentCompletionRef.current,
          openedModalNow: shouldOpen,
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
    void syncFromServer();
  }, [syncFromServer]);

  useEffect(() => {
    const unsubscribe = subscribeToAllAssignmentsCompleted(() => {
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
