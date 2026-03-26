"use client";

import { useState } from "react";
import {
  DEFAULT_TTS_RATE,
  TTS_RATE_OPTIONS,
  getStoredTtsRate,
  setStoredTtsRate,
} from "@/lib/tts-settings";
import { getStoredUserRole, setStoredUserRole, type UserRole } from "@/lib/user-role";
import {
  AUTO_READ_FEEDBACK_KEY,
  DEFAULT_SESSION_MINUTES_KEY,
  getStoredBoolean,
  getStoredNumber,
  setStoredBoolean,
  setStoredNumber,
} from "@/lib/ui-settings";

export default function SettingsPage() {
  const [ttsRate, setTtsRate] = useState(() =>
    getStoredTtsRate(DEFAULT_TTS_RATE),
  );
  const [userRole, setUserRole] = useState<UserRole>(() => getStoredUserRole("student"));
  const [autoReadFeedback, setAutoReadFeedback] = useState(() =>
    getStoredBoolean(AUTO_READ_FEEDBACK_KEY, false),
  );
  const [defaultSessionMinutes, setDefaultSessionMinutes] = useState(() =>
    getStoredNumber(DEFAULT_SESSION_MINUTES_KEY, 30),
  );

  const handleRateChange = (value: number) => {
    setTtsRate(value);
    setStoredTtsRate(value);
  };

  const handleRoleChange = (value: UserRole) => {
    setUserRole(value);
    setStoredUserRole(value);
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <section className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-2">
          Settings
        </h1>
        <p className="text-slate-gray/70">
          Configure read-aloud options for all practice modes.
        </p>
      </section>

      <section className="rounded-xl border border-[#16a34a]/30 bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-gray mb-2">
          Read Aloud
        </h2>
        <p className="text-sm text-slate-gray/70 mb-4">
          Reading speed is applied across Guided, Practice, Review, and Exam
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
            className="rounded-lg border border-slate-gray/20 bg-white px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/50"
          >
            {TTS_RATE_OPTIONS.map((rate) => (
              <option key={rate} value={rate}>
                {rate.toFixed(2)}x
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded-xl border border-[#16a34a]/30 bg-white p-5 sm:p-6 shadow-sm mt-5">
        <h2 className="text-lg font-semibold text-slate-gray mb-2">Account (Demo)</h2>
        <p className="text-sm text-slate-gray/70 mb-4">
          Temporary role switch until login and permissions are connected.
        </p>
        <div className="inline-flex items-center gap-2">
          <label className="text-sm font-medium text-slate-gray" htmlFor="user-role">
            Role
          </label>
          <select
            id="user-role"
            value={userRole}
            onChange={(event) => handleRoleChange(event.target.value as UserRole)}
            className="rounded-lg border border-slate-gray/20 bg-white px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/50"
          >
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </div>
      </section>

      <section className="rounded-xl border border-[#16a34a]/30 bg-white p-5 sm:p-6 shadow-sm mt-5">
        <h2 className="text-lg font-semibold text-slate-gray mb-2">Study Preferences</h2>
        <div className="space-y-4">
          <label className="flex items-center gap-3 text-sm text-slate-gray">
            <input
              type="checkbox"
              checked={autoReadFeedback}
              onChange={(event) => {
                const value = event.target.checked;
                setAutoReadFeedback(value);
                setStoredBoolean(AUTO_READ_FEEDBACK_KEY, value);
              }}
              className="h-4 w-4 rounded border-slate-300"
            />
            Auto-read feedback after answer submission (coming soon)
          </label>
          <div className="inline-flex items-center gap-2">
            <label className="text-sm font-medium text-slate-gray" htmlFor="default-session">
              Default session time
            </label>
            <select
              id="default-session"
              value={defaultSessionMinutes}
              onChange={(event) => {
                const value = Number(event.target.value);
                setDefaultSessionMinutes(value);
                setStoredNumber(DEFAULT_SESSION_MINUTES_KEY, value);
              }}
              className="rounded-lg border border-slate-gray/20 bg-white px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/50"
            >
              <option value={15}>15 mins</option>
              <option value={30}>30 mins</option>
              <option value={60}>60 mins</option>
            </select>
          </div>
        </div>
      </section>
    </main>
  );
}
