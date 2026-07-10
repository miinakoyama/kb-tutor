/**
 * Seed the bundled sample short-answer item into a generated question set for
 * local testing (tasks.md T016). Inserts directly via the Supabase service-role
 * client so it can run outside the browser.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-short-answer-sample.mjs [ownerUserId]
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env.
 * Pass a teacher/admin auth user id as the owner so RLS-scoped reads resolve it;
 * defaults to the SEED_OWNER_USER_ID env var.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local.",
  );
  process.exit(1);
}

const ownerId = process.argv[2] ?? process.env.SEED_OWNER_USER_ID;
if (!ownerId) {
  console.error(
    "Provide an owner auth user id: node --env-file=.env.local scripts/seed-short-answer-sample.mjs <userId>",
  );
  process.exit(1);
}

const item = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../src/data/short-answer/sample-item.json"),
    "utf-8",
  ),
);

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const generatedAt = new Date().toISOString();
const setId = `generated-sa-sample-${Date.now()}`;
const questionId = "sa-sample-0001";

const payload = {
  id: questionId,
  module: 1,
  topic: "Genetics",
  standardId: item.blueprint.targetStandard,
  text: item.parts[0].prompt,
  imageUrl: null,
  options: [],
  correctOptionId: "",
  questionType: "open-ended",
  shortAnswer: item,
  source: "generated",
};

const run = async () => {
  const { error: setErr } = await supabase
    .from("generated_question_sets")
    .upsert({
      id: setId,
      user_id: ownerId,
      name: "Short-answer sample set",
      generated_at: generatedAt,
      generation_model_id: "sample-fixture",
      generation_model_label: "Sample fixture",
    });
  if (setErr) throw new Error(`set insert failed: ${setErr.message}`);

  const { error: qErr } = await supabase.from("generated_questions").upsert({
    id: questionId,
    set_id: setId,
    user_id: ownerId,
    payload,
    is_visible: true,
    include_in_self_practice: true,
  });
  if (qErr) throw new Error(`question insert failed: ${qErr.message}`);

  console.log(`Seeded short-answer sample set ${setId} (question ${questionId}).`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
