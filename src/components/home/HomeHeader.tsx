import { Bell } from "lucide-react";

/**
 * No notification data source exists yet anywhere in the app (checked
 * Sidebar/AppChrome — no bell, no count). Render the icon as a plain,
 * non-interactive affordance rather than a dead button or a fabricated
 * badge count.
 */
export function HomeHeader() {
  return (
    <header className="mb-4 flex items-center justify-between gap-3">
      <h1 className="font-heading text-2xl font-bold text-heading sm:text-3xl">
        Welcome back
      </h1>
      <span
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
        style={{
          background: "var(--assignment-calendar-nav-bg)",
          border: "1px solid var(--assignment-glass-border)",
        }}
        aria-label="Notifications"
        role="img"
      >
        <Bell className="h-5 w-5 text-slate-gray" aria-hidden="true" />
      </span>
    </header>
  );
}
