"use client";

import { Bell, Lightbulb } from "lucide-react";
import {
  DEFAULT_STUDENT_ID,
  getNotificationsForRecipient,
} from "@/lib/mock-data";

const FALLBACK_MESSAGES = [
  "Study tip: explain one concept out loud after every 5 questions.",
  "Fun fact: ATP can be recycled quickly, but your body stores very little at once.",
  "Study tip: compare two similar terms to strengthen memory retrieval.",
];

export default function NotificationsPage() {
  const formatCreatedAt = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));

  const notifications = getNotificationsForRecipient("student", DEFAULT_STUDENT_ID);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <section className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-2">
          Notification
        </h1>
        <p className="text-slate-gray/70">Recent updates from assignments and learning activity.</p>
      </section>

      {notifications.length === 0 ? (
        <section className="rounded-xl border border-[#16a34a]/30 bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-[#16a34a] mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-gray mb-1">No new notifications</p>
              <p className="text-sm text-slate-gray/70">{FALLBACK_MESSAGES[0]}</p>
            </div>
          </div>
        </section>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-[#16a34a]/20 bg-white p-4 sm:p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-[#16a34a] mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-slate-gray leading-relaxed">{item.message}</p>
                  <p className="text-xs text-slate-gray/50 mt-2">
                    {formatCreatedAt(item.createdAt)}
                  </p>
                </div>
                {!item.read && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#16a34a]/10 text-[#166534]">
                    New
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
