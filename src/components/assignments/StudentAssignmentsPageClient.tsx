"use client";

import { useEffect, useState } from "react";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import { readAllAssignmentsCompleteNudgeDismissed } from "@/lib/self-practice-completion-nudge";
import { StudentAssignmentsList } from "@/components/assignments/StudentAssignmentsList";
import { AllAssignmentsCompleteSelfPracticeModal } from "@/components/assignments/AllAssignmentsCompleteSelfPracticeModal";

interface StudentAssignmentsPageClientProps {
  assignments: StudentAssignmentListItem[];
  loadError: string | null;
}

export function StudentAssignmentsPageClient({
  assignments,
  loadError,
}: StudentAssignmentsPageClientProps) {
  const [showAllCompleteModal, setShowAllCompleteModal] = useState(false);

  useEffect(() => {
    if (loadError) return;
    if (assignments.length === 0) return;
    const allDone = assignments.every((a) => a.status === "completed");
    if (!allDone) return;
    if (readAllAssignmentsCompleteNudgeDismissed()) return;
    setShowAllCompleteModal(true);
  }, [assignments, loadError]);

  return (
    <>
      <StudentAssignmentsList assignments={assignments} loadError={loadError} />
      <AllAssignmentsCompleteSelfPracticeModal
        open={showAllCompleteModal}
        onDismiss={() => setShowAllCompleteModal(false)}
      />
    </>
  );
}
