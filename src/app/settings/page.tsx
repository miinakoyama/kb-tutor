"use client";

import { useEffect, useState } from "react";
import {
  syncAppearanceFromDb,
  type AppearanceMode,
} from "@/lib/appearance-settings";
import { useTheme } from "@/components/ThemeProvider";
import {
  DEFAULT_TTS_RATE,
  TTS_RATE_OPTIONS,
  syncTtsRateFromDb,
  setStoredTtsRate,
} from "@/lib/tts-settings";
import {
  getStoredTimeZone,
  setStoredTimeZone,
  syncTimeZoneFromDb,
} from "@/lib/timezone-settings";
import {
  COMMON_TIME_ZONES,
  DEFAULT_APP_TIME_ZONE,
  getBrowserTimeZone,
} from "@/lib/timezone";
import { requestOnboardingReplay } from "@/lib/onboarding-settings";

const APPEARANCE_OPTIONS: { value: AppearanceMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function AppearanceControl() {
  const { appearanceMode, setAppearanceMode } = useTheme();

  return (
    <div
      role="group"
      aria-label="Appearance"
      className="inline-flex rounded-lg border border-border-default bg-surface-muted p-1"
    >
      {APPEARANCE_OPTIONS.map((option) => {
        const selected = appearanceMode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => setAppearanceMode(option.value)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
              selected
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type AppRole = "student" | "teacher" | "admin";

export default function SettingsPage() {
  const { syncAppearanceMode } = useTheme();
  const [ttsRate, setTtsRate] = useState(DEFAULT_TTS_RATE);
  const [role, setRole] = useState<AppRole>("student");
  const browserTimeZone = getBrowserTimeZone(DEFAULT_APP_TIME_ZONE);
  const [timeZone, setTimeZone] = useState(
    getStoredTimeZone(browserTimeZone),
  );

  useEffect(() => {
    const load = async () => {
      const value = await syncTtsRateFromDb(DEFAULT_TTS_RATE);
      setTtsRate(value);
      const syncedZone = await syncTimeZoneFromDb(browserTimeZone);
      setTimeZone(syncedZone);
      const syncedAppearance = await syncAppearanceFromDb();
      syncAppearanceMode(syncedAppearance);

      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Failed to load role");
        }
        const payload = (await response.json()) as {
          profile?: { role?: AppRole } | null;
          user?: {
            user_metadata?: { role?: string };
            app_metadata?: { role?: string };
          } | null;
        };
        const inferredRole =
          payload.profile?.role ??
          (payload.user?.user_metadata?.role === "teacher" ||
          payload.user?.user_metadata?.role === "admin"
            ? payload.user.user_metadata.role
            : payload.user?.app_metadata?.role === "teacher" ||
                payload.user?.app_metadata?.role === "admin"
              ? payload.user.app_metadata.role
              : "student");
        setRole(inferredRole);
      } catch {
        setRole("student");
      }
    };
    void load();
  }, [browserTimeZone, syncAppearanceMode]);

  const handleRateChange = (value: number) => {
    setTtsRate(value);
    setStoredTtsRate(value);
  };

  const handleTimeZoneChange = (value: string) => {
    setTimeZone(value);
    setStoredTimeZone(value);
  };

  const timeZoneOptions = Array.from(
    new Set([browserTimeZone, ...COMMON_TIME_ZONES]),
  );

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <section className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading mb-2">
          Settings
        </h1>
        <p className="text-muted-foreground">
          Configure your personal preferences for appearance, read-aloud, and time
          zone.
        </p>
      </section>

      <section className="rounded-xl border border-primary/30 bg-surface p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground mb-2">Appearance</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Choose how the app looks. System follows your device light or dark
          setting.
        </p>
        <AppearanceControl />
      </section>

      <section className="rounded-xl border border-primary/30 bg-surface p-5 sm:p-6 shadow-sm mt-6">
        <h2 className="text-lg font-semibold text-slate-gray mb-2">
          Read Aloud
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Reading speed is applied across Practice, Review, and Exam
          modes.
        </p>

        <div className="inline-flex items-center gap-2">
          <label
            htmlFor="tts-rate"
            className="text-sm font-medium text-slate-gray"
          >
            Reading speed
          </label>
          <select
            id="tts-rate"
            value={ttsRate}
            onChange={(e) => handleRateChange(Number(e.target.value))}
            className="rounded-lg border border-border-default bg-surface px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {TTS_RATE_OPTIONS.map((rate) => (
              <option key={rate} value={rate}>
                {rate.toFixed(2)}x
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded-xl border border-primary/30 bg-surface p-5 sm:p-6 shadow-sm mt-6">
        <h2 className="text-lg font-semibold text-slate-gray mb-2">
          Time Zone
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Used for notifications and streak date calculations.
        </p>

        <div className="inline-flex items-center gap-2">
          <label
            htmlFor="time-zone"
            className="text-sm font-medium text-slate-gray"
          >
            Preferred time zone
          </label>
          <select
            id="time-zone"
            value={timeZone}
            onChange={(e) => handleTimeZoneChange(e.target.value)}
            className="rounded-lg border border-border-default bg-surface px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {timeZoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded-xl border border-primary/30 bg-surface p-5 sm:p-6 shadow-sm mt-6">
        <h2 className="text-lg font-semibold text-slate-gray mb-2">
          Onboarding Tour
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Replay the guided product tour anytime.
        </p>
        {role === "admin" ? (
          <p className="text-sm text-muted-foreground">
            Onboarding tour is available for student and teacher accounts.
          </p>
        ) : (
          <button
            type="button"
            onClick={requestOnboardingReplay}
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            Replay tour
          </button>
        )}
      </section>
    </main>
  );
}
