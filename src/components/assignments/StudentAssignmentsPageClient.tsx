"use client";

import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import { StudentAssignmentsList } from "@/components/assignments/StudentAssignmentsList";

interface StudentAssignmentsPageClientProps {
  assignments: StudentAssignmentListItem[];
  loadError: string | null;
}

export function StudentAssignmentsPageClient({
  assignments,
  loadError,
}: StudentAssignmentsPageClientProps) {
  return <StudentAssignmentsList assignments={assignments} loadError={loadError} />;
}
