"use client";

import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import { StudentAssignmentsList } from "@/components/assignments/StudentAssignmentsList";

interface StudentAssignmentsPageClientProps {
  assignments: StudentAssignmentListItem[];
  loadError: string | null;
  /** Pre-fills the search box (e.g. arriving from the homepage search). */
  initialQuery?: string;
}

export function StudentAssignmentsPageClient({
  assignments,
  loadError,
  initialQuery = "",
}: StudentAssignmentsPageClientProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <StudentAssignmentsList
        assignments={assignments}
        loadError={loadError}
        initialQuery={initialQuery}
      />
    </div>
  );
}
