"use client";

import Link from "next/link";
import { Bell, ClipboardList, NotebookPen, Lightbulb } from "lucide-react";
import {
  DEFAULT_STUDENT_ID,
  getAssignmentsForStudent,
  getNotificationsForRecipient,
} from "@/lib/mock-data";

const FALLBACK_TIPS = [
  "Tip: Try to explain each answer before submitting. It improves retention.",
  "Fun fact: Keystone biology often tests concept connections, not isolated facts.",
];

export default function Home() {
  const notifications = getNotificationsForRecipient(
    "student",
    DEFAULT_STUDENT_ID,
  ).slice(0, 3);
  const assignments = getAssignmentsForStudent(DEFAULT_STUDENT_ID);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <section className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-2">
          Home
        </h1>
        <p className="text-slate-gray/70">
          Continue your Keystone Biology learning with your next best action.
        </p>
      </section>

      <section className="rounded-2xl border border-[#16a34a]/25 bg-white p-5 sm:p-6 shadow-sm mb-6">
        <div className="flex items-start gap-3">
          <Bell className="w-5 h-5 text-[#16a34a] mt-0.5" />
          <div className="w-full">
            <h2 className="text-lg font-semibold text-slate-gray mb-3">
              Latest Notifications
            </h2>
            {notifications.length > 0 ? (
              <ul className="space-y-2">
                {notifications.map((item) => (
                  <li key={item.id} className="text-sm text-slate-gray/80">
                    {item.message}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg border border-[#16a34a]/20 bg-[#16a34a]/5 p-3 text-sm text-slate-gray/80 inline-flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-[#16a34a] mt-0.5" />
                {FALLBACK_TIPS[0]}
              </div>
            )}
            <Link
              href="/notifications"
              className="inline-flex text-sm font-medium text-[#16a34a] hover:text-[#15803d] mt-3"
            >
              View all notifications
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 mb-6">
        <Link
          href="/assignments"
          className="rounded-2xl border border-[#16a34a]/25 bg-white p-5 sm:p-6 shadow-sm hover:border-[#16a34a] transition-colors"
        >
          <div className="inline-flex items-center gap-2 text-[#16a34a] mb-2">
            <ClipboardList className="w-5 h-5" />
            <span className="font-semibold">My Assignment</span>
          </div>
          <p className="text-sm text-slate-gray/75">
            {assignments.length > 0
              ? `${assignments.length} active assignments from your teacher`
              : "No assignment due. Great chance to self-practice."}
          </p>
        </Link>
        <Link
          href="/self-practice"
          className="rounded-2xl border border-[#16a34a]/25 bg-white p-5 sm:p-6 shadow-sm hover:border-[#16a34a] transition-colors"
        >
          <div className="inline-flex items-center gap-2 text-[#16a34a] mb-2">
            <NotebookPen className="w-5 h-5" />
            <span className="font-semibold">Self Practice</span>
          </div>
          <p className="text-sm text-slate-gray/75">
            Choose topics, mode, and time. Exam mode is available inside Self
            Practice.
          </p>
        </Link>
      </section>
    </main>
  );
}

