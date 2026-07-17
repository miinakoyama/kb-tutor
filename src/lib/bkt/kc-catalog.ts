import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnowledgeComponent } from "@/types/bkt";

interface KnowledgeComponentRow {
  code: string;
  standard_id: string;
  short_code: string;
  statement: string;
  vocabulary: unknown;
  catalog_order: number;
  active: boolean;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function kcBelongsToStandard(kcCode: string, standardId: string): boolean {
  return kcCode.startsWith(`${standardId}`) && kcCode.length > standardId.length;
}

export function normalizeKnowledgeComponent(row: KnowledgeComponentRow): KnowledgeComponent {
  return {
    code: row.code,
    standardId: row.standard_id,
    shortCode: row.short_code,
    statement: row.statement,
    vocabulary: stringArray(row.vocabulary),
    catalogOrder: row.catalog_order,
    active: row.active,
  };
}

export async function fetchKnowledgeComponents(
  supabase: SupabaseClient,
  standardIds?: string[],
): Promise<KnowledgeComponent[]> {
  let query = supabase
    .from("knowledge_components")
    .select("code,standard_id,short_code,statement,vocabulary,catalog_order,active")
    .eq("active", true)
    .order("standard_id", { ascending: true })
    .order("catalog_order", { ascending: true });
  if (standardIds?.length) query = query.in("standard_id", standardIds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as KnowledgeComponentRow[]).map(normalizeKnowledgeComponent);
}

export function validateKcCode(
  catalog: readonly KnowledgeComponent[],
  kcCode: string,
  standardId: string,
): KnowledgeComponent | null {
  return (
    catalog.find(
      (kc) => kc.active && kc.code === kcCode && kc.standardId === standardId,
    ) ?? null
  );
}
