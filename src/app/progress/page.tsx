"use client";

import { Flame } from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { MODULES } from "@/types/question";

const TOPICS = MODULES.flatMap((m) =>
  m.topics.map((t) => ({ topic: t, module: m.id }))
);

const MOCK_MASTERY = TOPICS.map(({ topic }) => ({
  topic: topic.length > 20 ? topic.slice(0, 17) + "..." : topic,
  fullTopic: topic,
  mastery: Math.floor(Math.random() * 60) + 40,
  fill: "#2d6a4f",
}));

export default function ProgressPage() {
  const streak = 7;

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-slate-gray mb-8">
        My Progress
      </h1>

      <div className="space-y-8">
        <section className="rounded-lg border border-leaf/30 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-gray mb-4 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            Learning Streak
          </h2>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-leaf">{streak}</span>
            <span className="text-slate-gray">days in a row</span>
          </div>
          <p className="text-sm text-slate-gray/80 mt-2">
            Keep practicing to maintain your streak! (Demo data)
          </p>
        </section>

        <section className="rounded-lg border border-leaf/30 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-gray mb-4">
            Topic Mastery
          </h2>
          <p className="text-sm text-slate-gray/80 mb-4">
            Your mastery level by topic. (Demo data — will sync with LTI)
          </p>
          <div className="h-[400px] min-h-[300px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={MOCK_MASTERY}>
                <PolarGrid stroke="#2d6a4f" strokeOpacity={0.3} />
                <PolarAngleAxis
                  dataKey="topic"
                  tick={{ fill: "#2c3e2e", fontSize: 11 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: "#2c3e2e", fontSize: 10 }}
                />
                <Radar
                  name="Mastery %"
                  dataKey="mastery"
                  stroke="#16a34a"
                  fill="#16a34a"
                  fillOpacity={0.6}
                  strokeWidth={2}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#f8f6f3",
                    border: "1px solid #2d6a4f",
                    borderRadius: "8px",
                  }}
                  formatter={(value) => [`${value ?? 0}%`, "Mastery"]}
                />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </main>
  );
}
