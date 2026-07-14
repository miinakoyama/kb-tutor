import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "../../src/lib/supabase/env.ts";

function option(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function run() {
  const command = process.argv[2];
  const runId = option("--run");
  const actor = option("--actor");
  if ((command !== "publish" && command !== "rollback") || !runId || !actor) {
    throw new Error("Usage: publish|rollback --run <run-id> --actor <admin-profile-uuid>");
  }
  const db = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const functionName = command === "publish"
    ? "publish_kc_classification_run"
    : "rollback_kc_classification_run";
  const { data, error } = await db.rpc(functionName, { p_run_id: runId, p_actor: actor });
  if (error) throw new Error(error.message);
  console.log(`${command === "publish" ? "Published" : "Rolled back"} run ${runId}`);
  console.log(JSON.stringify(data, null, 2));
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Operation failed");
  process.exitCode = 1;
});
