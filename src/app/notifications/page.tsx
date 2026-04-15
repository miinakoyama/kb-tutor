import { redirect } from "next/navigation";
import { Bell, Lightbulb } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStudentNotifications } from "@/lib/notifications";
import { DEFAULT_APP_TIME_ZONE, normalizeTimeZone } from "@/lib/timezone";

const FALLBACK_MESSAGES = [
  "You're all caught up. Check Self Practice to keep momentum.",
];

export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: settingsData } = await supabase
    .from("user_settings")
    .select("time_zone")
    .maybeSingle();
  const timeZone = normalizeTimeZone(
    settingsData?.time_zone,
    DEFAULT_APP_TIME_ZONE,
  );

  const notificationResult = await getStudentNotifications(supabase, user.id, {
    timeZone,
  });
  const notifications = notificationResult.notifications;
  const notificationsError = notificationResult.error;

  const formatCreatedAt = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZoneName: "short",
      timeZone,
    }).format(new Date(value));

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <section className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-2">
          Notifications
        </h1>
        <p className="text-slate-gray/70">
          Recent updates from assignments and deadlines.
        </p>
      </section>

      {notificationsError && (
        <section className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 mb-4">
          <p className="text-sm text-red-700">
            Failed to load notifications. Please refresh and try again.
          </p>
        </section>
      )}

      {notifications.length === 0 ? (
        <section className="rounded-xl border border-[#16a34a]/30 bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-[#16a34a] mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-gray mb-1">
                No new notifications
              </p>
              <p className="text-sm text-slate-gray/70">
                {FALLBACK_MESSAGES[0]}
              </p>
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
                  <p className="text-sm text-slate-gray leading-relaxed">
                    {item.message}
                  </p>
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
