"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import { buildPracticeHref } from "@/components/assignments/AssignmentRow";
import { getAssignmentModeMeta } from "@/components/assignments/assignment-design";

const MAX_RESULTS = 6;

/**
 * Homepage search — same pill styling as the My Assignments search bar.
 * Typing filters the student's assignments live (the full list is already
 * on the page); picking a result opens that assignment, and Enter (or the
 * footer link) lands on /assignments?q=… with the query pre-filled.
 */
export function HomeSearch({
  assignments,
}: {
  assignments: StudentAssignmentListItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      q
        ? assignments
            .filter((a) => a.title.toLowerCase().includes(q))
            .slice(0, MAX_RESULTS)
        : [],
    [assignments, q],
  );

  const allResultsHref = `/assignments?q=${encodeURIComponent(query.trim())}`;
  const showDropdown = isOpen && q.length > 0;

  return (
    <div className="relative w-full max-w-[380px]">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        style={{ width: 15, height: 15 }}
        aria-hidden="true"
      />
      <input
        type="search"
        placeholder="Search assignments…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && q) {
            setIsOpen(false);
            router.push(allResultsHref);
          }
          if (event.key === "Escape") setIsOpen(false);
        }}
        aria-label="Search assignments"
        className="w-full bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        style={{
          paddingLeft: 36,
          paddingRight: 14,
          height: 38,
          fontSize: 14,
          borderRadius: 999,
          background: "var(--assignment-search-bg)",
          border: "1px solid var(--assignment-search-border)",
          boxShadow: "var(--assignment-search-shadow)",
          backdropFilter: "blur(14px) saturate(112%)",
          WebkitBackdropFilter: "blur(14px) saturate(112%)",
        }}
      />

      {showDropdown && (
        <>
          {/* Click-away dismissal */}
          <button
            type="button"
            aria-label="Close search results"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--assignment-glass-border)",
              boxShadow: "var(--assignment-popover-shadow)",
            }}
          >
            {matches.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                No assignments match your search.
              </p>
            ) : (
              <ul>
                {matches.map((assignment) => {
                  const { label, color, pillBg } = getAssignmentModeMeta(
                    assignment.mode,
                  );
                  return (
                    <li key={assignment.id}>
                      <Link
                        href={buildPracticeHref(assignment)}
                        onClick={() => setIsOpen(false)}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--surface-muted)]"
                      >
                        <span className="min-w-0 truncate font-medium text-slate-gray">
                          {assignment.title}
                        </span>
                        <span
                          className="flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ color, background: pillBg }}
                        >
                          {label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              href={allResultsHref}
              onClick={() => setIsOpen(false)}
              className="block border-t px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--surface-muted)]"
              style={{
                color: "var(--assignment-completed)",
                borderColor: "var(--border-subtle)",
              }}
            >
              See all results in My Assignments →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
