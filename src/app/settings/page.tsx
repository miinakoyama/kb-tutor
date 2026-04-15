"use client";

import { useEffect, useState } from "react";
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

export default function SettingsPage() {
  const [ttsRate, setTtsRate] = useState(DEFAULT_TTS_RATE);
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
    };
    void load();
  }, [browserTimeZone]);

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

      <section className="rounded-xl border border-[#16a34a]/30 bg-white p-5 sm:p-6 shadow-sm mt-6">
        <h2 className="text-lg font-semibold text-slate-gray mb-2">
          Time Zone
        </h2>
        <p className="text-sm text-slate-gray/70 mb-4">
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
            className="rounded-lg border border-slate-gray/20 bg-white px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/50"
          >
            {timeZoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>
      </section>
    </main>
  );
}
