import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "../../src/lib/supabase/env.ts";

function standardsArg(): string[] {
  const index = process.argv.indexOf("--standards");
  return index >= 0
    ? (process.argv[index + 1] ?? "").split(",").map((value) => value.trim()).filter(Boolean)
    : [];
}

async function run() {
  const db = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let query = db
    .from("bkt_question_coverage")
    .select("standard_id,format,include_in_self_practice,coverage_state,confirmed_kc_codes")
    .order("standard_id");
  const standards = standardsArg();
  if (standards.length) query = query.in("standard_id", standards);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const summaries = new Map<string, { total: number; valid: number; unresolved: number; invalid: number; selfPractice: number }>();
  for (const row of data ?? []) {
    const standard = String(row.standard_id ?? "unknown");
    const summary = summaries.get(standard) ?? { total: 0, valid: 0, unresolved: 0, invalid: 0, selfPractice: 0 };
    summary.total += 1;
    if (row.include_in_self_practice) summary.selfPractice += 1;
    if (row.coverage_state === "valid") summary.valid += 1;
    if (row.coverage_state === "unresolved") summary.unresolved += 1;
    if (row.coverage_state === "invalid") summary.invalid += 1;
    summaries.set(standard, summary);
  }
  console.table(Array.from(summaries, ([standardId, counts]) => ({ standardId, ...counts })));
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Coverage inventory failed");
  process.exitCode = 1;
});
