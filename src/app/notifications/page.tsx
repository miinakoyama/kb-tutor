import { redirect } from "next/navigation";
import { Bell, Lightbulb } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStudentNotifications } from "@/lib/notifications";
import { getStudentUserSettings } from "@/lib/user-settings";
import { NotificationsMarkRead } from "@/components/NotificationsMarkRead";

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

  const { timeZone, notificationsLastReadAt } =
    await getStudentUserSettings(supabase);

  const notificationResult = await getStudentNotifications(supabase, user.id, {
    timeZone,
    lastReadAt: notificationsLastReadAt,
  });
  const notifications = notificationResult.notifications;
  const notificationsError = notificationResult.error;

  const formatCreatedAt = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone,
    }).format(new Date(value));

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <NotificationsMarkRead />
      <section className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading mb-2">
          Notifications
        </h1>
        <p className="text-muted-foreground">
          Recent updates from assignments and deadlines.
        </p>
      </section>

      {notificationsError && (
        <section className="rounded-lg border border-error-border bg-error-light px-4 py-3 mb-4">
          <p className="text-sm text-error">
            Failed to load notifications. Please refresh and try again.
          </p>
        </section>
      )}

      {notifications.length === 0 ? (
        <section className="rounded-xl border border-primary/30 bg-surface p-5 sm:p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-gray mb-1">
                No new notifications
              </p>
              <p className="text-sm text-muted-foreground">
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
              className="rounded-xl border border-primary/20 bg-surface p-4 sm:p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-slate-gray leading-relaxed">
                    {item.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatCreatedAt(item.createdAt)}
                  </p>
                </div>
                {!item.read && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-forest">
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
