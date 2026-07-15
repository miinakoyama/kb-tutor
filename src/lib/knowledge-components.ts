import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export interface KnowledgeComponent {
  code: string;
  statement: string;
}

/** Active KCs for a standard, readable by any authenticated user (teacher or admin). */
export async function fetchActiveKcsForStandard(
  standardId: string,
): Promise<KnowledgeComponent[]> {
  if (!standardId) return [];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("knowledge_components")
    .select("code,statement")
    .eq("standard_id", standardId)
    .eq("active", true)
    .order("code", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({ code: String(row.code), statement: String(row.statement) }));
}
