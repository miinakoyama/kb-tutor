import Link from "next/link";
import { CalendarDays, ClipboardList, Play } from "lucide-react";
import { DEFAULT_STUDENT_ID, getAssignmentsForStudent } from "@/lib/mock-data";

function estimateQuestionCount(targetMinutes: number): number {
  return Math.max(6, Math.min(40, Math.round(targetMinutes / 1.8)));
}

export default function AssignmentsPage() {
  const assignments = getAssignmentsForStudent(DEFAULT_STUDENT_ID);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <section className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-2">
          My Assignment
        </h1>
        <p className="text-slate-gray/70">
          Complete teacher-assigned practice with adaptive support.
        </p>
      </section>

      {assignments.length === 0 ? (
        <section className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm">
          <p className="text-slate-gray">No active assignments right now.</p>
        </section>
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment) => {
            const params = new URLSearchParams({
              mode: "adaptive",
              assignmentId: assignment.id,
              questions: String(
                estimateQuestionCount(assignment.targetMinutes),
              ),
              topics: assignment.topics
                .map((topic) => encodeURIComponent(topic))
                .join(","),
            });
            return (
              <article
                key={assignment.id}
                className="rounded-2xl border border-[#16a34a]/25 bg-white p-5 sm:p-6 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="inline-flex items-center gap-2 text-xs font-semibold text-[#16a34a] bg-[#16a34a]/10 px-2 py-1 rounded-full mb-2">
                      <ClipboardList className="w-3.5 h-3.5" />
                      Assignment
                    </p>
                    <h2 className="text-lg font-semibold text-slate-gray">
                      {assignment.title}
                    </h2>
                    <p className="text-sm text-slate-gray/70 mt-1">
                      Topics: {assignment.topics.slice(0, 3).join(", ")}
                      {assignment.topics.length > 3
                        ? ` +${assignment.topics.length - 3} more`
                        : ""}
                    </p>
                    {assignment.dueDate ? (
                      <p className="text-xs text-slate-gray/60 mt-2 inline-flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5" />
                        Due {new Date(assignment.dueDate).toLocaleDateString()}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-gray/50 mt-2">
                        No due date
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/practice?${params.toString()}`}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#16a34a] text-white text-sm font-medium hover:bg-[#15803d] transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    Start Assignment
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
