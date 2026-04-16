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

  for (const schoolId of schoolIds) {
    const { data: links, error } = await supabase
      .from("school_question_sets")
      .select("set_id")
      .eq("school_id", schoolId);

    if (error) {
      return { ok: false, message: error.message };
    }

    const setIds = [...new Set((links ?? []).map((row) => row.set_id))];
    if (setIds.length === 0) continue;

    const { data: sets, error: setsError } = await supabase
      .from("generated_question_sets")
      .select("id, name")
      .in("id", setIds);

    if (setsError) {
      return { ok: false, message: setsError.message };
    }

    for (const row of sets ?? []) {
      if (excludeSetId && row.id === excludeSetId) continue;
      if (String(row.name).trim().toLowerCase() === normalized) {
        return { ok: false, message: DUPLICATE_MESSAGE };
      }
    }
  }

  return { ok: true };
}

export const DUPLICATE_SET_NAME_MESSAGE = DUPLICATE_MESSAGE;
