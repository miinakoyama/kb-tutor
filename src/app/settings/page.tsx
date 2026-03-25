"use client";

import { useState } from "react";
import {
  DEFAULT_TTS_RATE,
  TTS_RATE_OPTIONS,
  getStoredTtsRate,
  setStoredTtsRate,
} from "@/lib/tts-settings";

export default function SettingsPage() {
  const [ttsRate, setTtsRate] = useState(() =>
    getStoredTtsRate(DEFAULT_TTS_RATE),
  );

  const handleRateChange = (value: number) => {
    setTtsRate(value);
    setStoredTtsRate(value);
  };

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
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
    </main>
  );
}
