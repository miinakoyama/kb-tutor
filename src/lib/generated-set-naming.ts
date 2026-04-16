import type { SupabaseClient } from "@supabase/supabase-js";

const DUPLICATE_MESSAGE =
  "A set with this name already exists for this school. Please choose a different name.";

/**
 * Ensures no other question set linked to any of the given schools shares the
 * same display name (trimmed, case-insensitive), optionally excluding one set id.
 */
export async function assertSetNameUniqueForSchools(
  supabase: SupabaseClient,
  name: string,
  schoolIds: string[],
  excludeSetId?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || schoolIds.length === 0) {
    return { ok: true };
  }
  const normalized = trimmed.toLowerCase();

  const { data: rows, error } = await supabase
    .from("school_question_sets")
    .select("set_id, generated_question_sets!inner(id, name)")
    .in("school_id", schoolIds);

  if (error) {
    return { ok: false, message: error.message };
  }

  for (const row of rows ?? []) {
    const g = row.generated_question_sets as
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null
      | undefined;
    const meta = Array.isArray(g) ? g[0] : g;
    if (!meta) continue;
    if (excludeSetId && String(meta.id) === excludeSetId) continue;
    if (String(meta.name).trim().toLowerCase() === normalized) {
      return { ok: false, message: DUPLICATE_MESSAGE };
    }
  }

  return { ok: true };
}

export const DUPLICATE_SET_NAME_MESSAGE = DUPLICATE_MESSAGE;
