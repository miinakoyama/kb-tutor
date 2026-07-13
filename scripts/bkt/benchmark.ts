import { performance } from "node:perf_hooks";
import { applyBktObservation } from "../../src/lib/bkt/calculation.ts";
import { orderTargetKcs } from "../../src/lib/bkt/selection.ts";
import { MCQ_PARAMETERS } from "../../src/lib/bkt/fixtures.ts";

function percentile(values: number[], value: number): number {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * value))] ?? 0;
}

const durations: number[] = [];
for (let iteration = 0; iteration < 10_000; iteration += 1) {
  const started = performance.now();
  applyBktObservation(0.3 + (iteration % 60) / 100, iteration % 2 === 0, MCQ_PARAMETERS);
  orderTargetKcs({
    candidates: Array.from({ length: 20 }, (_, index) => ({
      kcCode: `S${index + 1}`, standardId: "S", catalogOrder: index + 1,
      probability: (index + 1) / 25, mastered: false, observed: true, lastServedAt: null,
    })),
    standardOrder: ["S"], cyclePositionByStandard: new Map([["S", iteration % 3]]),
    standardLastServedAt: new Map(), recentKcCodes: [],
  });
  durations.push(performance.now() - started);
}
const p95 = percentile(durations, 0.95);
console.log(`Pure BKT + selector p95: ${p95.toFixed(3)}ms`);
if (p95 >= 50) {
  throw new Error(`Pure decision p95 ${p95.toFixed(3)}ms exceeds the 50ms local budget`);
}
