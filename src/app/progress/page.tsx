"use client";

import { useEffect, useMemo, useState } from "react";
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
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getStandardById,
  getStandardsForModule,
  getDefaultStandardForTopic,
  type ModuleCode,
} from "@/lib/standards";

type AttemptRow = {
  is_correct: boolean;
  answered_at: string;
  topic: string | null;
  standard_id: string | null;
};

type MasteryDatum = {
  topic: string;
  fullTopic: string;
  mastery: number;
  attempts: number;
  fill: string;
};

const MODULE_ORDER: ModuleCode[] = ["A", "B"];
const APP_TIME_ZONE = "America/New_York";

const PROGRESS_TOPICS = MODULE_ORDER.flatMap((module) => {
  const categories = Array.from(
    new Set(getStandardsForModule(module).map((standard) => standard.category)),
  );
  return categories.map((category) => ({
    key: `Module ${module} - ${category}`,
    module,
    category,
  }));
});

function toDateKey(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
  }).format(value);
}

function resolveTopicKey(row: AttemptRow): string | null {
  const byStandard =
    typeof row.standard_id === "string" && row.standard_id.trim()
      ? getStandardById(row.standard_id)
      : undefined;
  if (byStandard) {
    return `Module ${byStandard.module} - ${byStandard.category}`;
  }

  const topic = typeof row.topic === "string" ? row.topic.trim() : "";
  if (!topic) return null;
  const fallback = getDefaultStandardForTopic(topic);
  return `Module ${fallback.module} - ${fallback.category}`;
}

function calculateStreak(rows: AttemptRow[]): number {
  const answeredDates = new Set(
    rows.map((row) => toDateKey(new Date(row.answered_at))),
  );
  if (answeredDates.size === 0) return 0;

  let streak = 0;
  const cursor = new Date();

  while (true) {
    const key = toDateKey(cursor);
    if (!answeredDates.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function calculateMastery(rows: AttemptRow[]): MasteryDatum[] {
  const totals = new Map<string, { correct: number; total: number }>();

  for (const row of rows) {
    const key = resolveTopicKey(row);
    if (!key) continue;

    const existing = totals.get(key) ?? { correct: 0, total: 0 };
    existing.total += 1;
    if (row.is_correct) existing.correct += 1;
    totals.set(key, existing);
  }

  return PROGRESS_TOPICS.map(({ key }) => {
    const stats = totals.get(key) ?? { correct: 0, total: 0 };
    const mastery =
      stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    return {
      topic: key,
      fullTopic: key,
      mastery,
      attempts: stats.total,
      fill: "#2d6a4f",
    };
  });
}

export default function ProgressPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  const [masteryData, setMasteryData] = useState<MasteryDatum[]>(() =>
    PROGRESS_TOPICS.map(({ key }) => ({
      topic: key,
      fullTopic: key,
      mastery: 0,
      attempts: 0,
      fill: "#2d6a4f",
    })),
  );

  useEffect(() => {
    const loadProgress = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("attempts")
          .select("is_correct,answered_at,topic,standard_id")
          .order("answered_at", { ascending: false })
          .limit(5000);

        if (error) {
          setIsLoading(false);
          return;
        }

        const rows = (data ?? []) as AttemptRow[];
        setStreak(calculateStreak(rows));
        setMasteryData(calculateMastery(rows));
      } finally {
        setIsLoading(false);
      }
    };

    void loadProgress();
  }, []);

  const attemptedTopicCount = useMemo(
    () => masteryData.filter((item) => item.attempts > 0).length,
    [masteryData],
  );

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-8">
        My Progress
      </h1>

      <div className="space-y-8">
        <section className="rounded-lg border border-leaf/30 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-gray mb-4 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            Learning Streak
          </h2>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-leaf">
              {isLoading ? "--" : streak}
            </span>
            <span className="text-slate-gray">days in a row</span>
          </div>
          <p className="text-sm text-slate-gray/80 mt-2">
            Calculated from your actual answer history.
          </p>
        </section>

        <section className="rounded-lg border border-leaf/30 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-gray mb-2">
            Topic Mastery
          </h2>
          <p className="text-sm text-slate-gray/80 mb-4">
            Mastery by current module/category topics based on your attempts.
          </p>
          <p className="text-xs text-slate-gray/70 mb-3">
            {isLoading
              ? "Loading progress..."
              : `${attemptedTopicCount}/${masteryData.length} topics have attempt data.`}
          </p>
          <div className="h-[280px] sm:h-[360px] md:h-[400px] min-h-[200px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={masteryData}>
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
                  formatter={(value, _name, item) => {
                    const payload = item?.payload as MasteryDatum | undefined;
                    const mastery = typeof value === "number" ? value : 0;
                    const attempts = payload?.attempts ?? 0;
                    return [`${mastery}% (${attempts} attempts)`, "Mastery"];
                  }}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as MasteryDatum | undefined;
                    return row?.fullTopic ?? String(label ?? "");
                  }}
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
