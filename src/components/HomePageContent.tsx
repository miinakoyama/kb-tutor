"use client";

import Link from "next/link";
import { Bell, ClipboardList, NotebookPen } from "lucide-react";
import type { StudentNotification } from "@/lib/notifications";

interface HomePageContentProps {
  assignmentCount: number;
  notifications: StudentNotification[];
}

export function HomePageContent({
  assignmentCount,
  notifications,
}: HomePageContentProps) {
  const topNotifications = notifications.slice(0, 3);
  const unreadCount = notifications.filter((item) => !item.read).length;
  const latestNotification =
    topNotifications[0]?.message ?? "No new notifications.";

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <section className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-2">
          Home
        </h1>
      </section>

      <section className="grid gap-4 lg:grid-cols-3 mb-6">
        <Link
          href="/assignments"
          className="lg:col-span-3 rounded-2xl border border-[#16a34a]/25 bg-white p-5 sm:p-6 shadow-sm hover:border-[#16a34a] transition-colors"
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="inline-flex items-center gap-2 text-[#16a34a]">
              <ClipboardList className="w-5 h-5" />
              <span className="font-semibold">My Assignment</span>
            </div>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-[#16a34a]/10 text-[#166534]">
              {assignmentCount} active
            </span>
          </div>
          <p className="text-base text-slate-gray/85">
            {assignmentCount > 0
              ? "Teacher assignments are ready. Continue from where you left off."
              : "No active assignments right now."}
          </p>
          <p className="text-sm text-slate-gray/70 mt-1">
            {assignmentCount > 0
              ? "Open assignments and start your next one."
              : "Use Self Practice to keep your momentum."}
          </p>
          <div className="mt-5">
            <span className="inline-flex items-center justify-center rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#15803d] transition-colors">
              {assignmentCount > 0 ? "View assignments" : "Go to assignments"}
            </span>
          </div>
        </Link>

        <div className="lg:col-span-3 grid gap-4 sm:grid-cols-2">
          <Link
            href="/self-practice"
            className="rounded-2xl border border-[#16a34a]/25 bg-white p-5 sm:p-6 shadow-sm hover:border-[#16a34a] transition-colors"
          >
            <div className="inline-flex items-center gap-2 text-[#16a34a] mb-2">
              <NotebookPen className="w-5 h-5" />
              <span className="font-semibold">Self Practice</span>
            </div>
            <p className="text-sm text-slate-gray/80">
              Choose topic and mode, then start a focused practice session.
            </p>
            <div className="mt-4">
              <span className="inline-flex items-center justify-center rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#15803d] transition-colors">
                Start self practice
              </span>
            </div>
          </Link>

          <Link
            href="/notifications"
            className="rounded-2xl border border-[#16a34a]/25 bg-white p-5 sm:p-6 shadow-sm hover:border-[#16a34a] transition-colors"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="inline-flex items-center gap-2 text-[#16a34a]">
                <Bell className="w-5 h-5" />
                <span className="font-semibold">Notifications</span>
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-[#16a34a]/10 text-[#166534]">
                {unreadCount} unread
              </span>
            </div>
            <p className="text-sm text-slate-gray/80 line-clamp-3">
              {latestNotification}
            </p>
            <div className="mt-4">
              <span className="inline-flex items-center justify-center rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#15803d] transition-colors">
                View notifications
              </span>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}
