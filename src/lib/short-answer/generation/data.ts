/**
 * Reference-data loaders for short-answer generation, ported from the reference
 * project's `lib/aig/data.ts`. Includes study-guide RAG retrieval for the C3
 * ablation config (Method2 blueprint + study-guide RAG + TELeR L2).
 *
 * Reads bundled fixtures from `src/data/short-answer/`. Server-side only (fs).
 */

import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { getOpenAIKey } from "@/lib/llm/env";
import { cosineSimilarity } from "@/lib/short-answer/grading/retrieval";

export interface KC {
  code: string;
  standard: string;
  kcId: string;
  statement: string;
  vocab: string[];
  module: string;
  unit: string;
}

export interface TaxonomyEntry {
  definition: string;
  scaffolding: string;
  difficulty: number;
}

export interface Card {
  card_id: string;
  item_id: string;
  part: "A" | "B" | "C";
  source: string;
  prompt: string;
  primary_type: string;
  secondary_type: string;
  cognitive_demand: string;
  evidence_demand: string;
}

export interface ItemRubric {
  item: string;
  alignment: string;
  dok: number;
  points_possible: number;
  scoring_guideline: string;
  credit_responses: Record<string, string[]>;
  sample_responses: Array<{
    score: number;
    responses: Record<string, string>;
    annotation: string;
  }>;
}

export interface ABCPrior {
  item: string;
  sequence: string[];
}

export interface WholeItemPart {
  part: "A" | "B" | "C";
  prompt: string;
  primary_type: string;
  difficulty: number;
}

export interface WholeItem {
  item_id: string;
  source: string;
  parts: WholeItemPart[];
}

export interface StudyGuideChunk {
  chunk_id: string;
  text: string;
}

export interface RetrievedStudyGuideChunk {
  chunkId: string;
  text: string;
  score: number;
}

const EMBEDDING_MODEL = "text-embedding-3-small";

let _openai: OpenAI | null = null;
function openaiClient(): OpenAI {
  return (_openai ??= new OpenAI({ apiKey: getOpenAIKey() }));
}

async function embedText(input: string): Promise<number[]> {
  const res = await openaiClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input,
  });
  return res.data[0].embedding;
}

interface StandardInfo {
  module: string;
  strand: string;
  statement: string;
}

function dataPath(filename: string): string {
  return path.join(process.cwd(), "src", "data", "short-answer", filename);
}

function parseCSV(raw: string): string[][] {
  const text = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

let _kcs: KC[] | null = null;
let _taxonomy: Record<string, TaxonomyEntry> | null = null;
let _cards: Card[] | null = null;
let _rubrics: { general: string; item_specific: ItemRubric[] } | null = null;
let _standardsInfo: Record<string, StandardInfo> | null = null;
let _studyGuideChunks: StudyGuideChunk[] | null = null;
let _chunkEmbeddings: Array<{ chunk: StudyGuideChunk; vec: number[] }> | null = null;
let _chunkEmbedInitPromise: Promise<void> | null = null;

export function getKCs(): KC[] {
  if (_kcs) return _kcs;
  const raw = fs.readFileSync(dataPath("kc_table.csv"), "utf-8");
  const rows = parseCSV(raw);
  if (rows.length < 2) return (_kcs = []);

  let lastModule = "";
  let lastUnit = "";
  const result: KC[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 5) continue;
    const [col0, col1, col2, col3, col4, col5] = row;
    if (col0) lastModule = col0.trim();
    if (col1) lastUnit = col1.trim();
    const standard = col2.trim();
    const kcId = col3.trim();
    const statement = col4.trim();
    const vocabRaw = col5 ?? "";
    if (!standard || !kcId || !statement) continue;
    const numeric = kcId.replace(/[^0-9]/g, "");
    const code = standard + numeric;
    const vocab = vocabRaw
      .split(/[;,]/)
      .map((v) => v.trim())
      .filter(Boolean);
    result.push({ code, standard, kcId, statement, vocab, module: lastModule, unit: lastUnit });
  }
  return (_kcs = result);
}

export function getTaxonomy(): Record<string, TaxonomyEntry> {
  if (_taxonomy) return _taxonomy;
  const raw = fs.readFileSync(dataPath("taxonomy_and_cards.json"), "utf-8");
  const data = JSON.parse(raw) as {
    taxonomy: Record<string, TaxonomyEntry>;
    cards: Card[];
  };
  _cards = data.cards;
  return (_taxonomy = data.taxonomy);
}

export function getCards(): Card[] {
  if (_cards) return _cards;
  getTaxonomy();
  return _cards!;
}

export function getRubrics(): { general: string; item_specific: ItemRubric[] } {
  if (_rubrics) return _rubrics;
  const raw = fs.readFileSync(dataPath("rubrics.json"), "utf-8");
  return (_rubrics = JSON.parse(raw) as {
    general: string;
    item_specific: ItemRubric[];
  });
}

function getStandardsInfo(): Record<string, StandardInfo> {
  if (_standardsInfo) return _standardsInfo;
  const raw = fs.readFileSync(dataPath("standards.json"), "utf-8");
  return (_standardsInfo = JSON.parse(raw) as Record<string, StandardInfo>);
}

export function getStandardInfo(code: string): StandardInfo | null {
  return getStandardsInfo()[code] ?? null;
}

export function getKCsByStandard(standard: string): KC[] {
  return getKCs().filter((kc) => kc.standard === standard);
}

export function getABCPriors(): ABCPrior[] {
  const cards = getCards();
  const byItem = new Map<string, Card[]>();
  for (const card of cards) {
    const list = byItem.get(card.item_id) ?? [];
    list.push(card);
    byItem.set(card.item_id, list);
  }
  const result: ABCPrior[] = [];
  for (const [item, itemCards] of Array.from(byItem.entries())) {
    const sorted = itemCards
      .filter((c) => ["A", "B", "C"].includes(c.part))
      .sort((a, b) => a.part.localeCompare(b.part));
    if (sorted.length < 2) continue;
    result.push({ item, sequence: sorted.map((c) => c.primary_type) });
  }
  return result;
}

export function getWholeItems(): WholeItem[] {
  const taxonomy = getTaxonomy();
  const cards = getCards();
  const byItem = new Map<string, Card[]>();
  for (const card of cards) {
    if (!["A", "B", "C"].includes(card.part)) continue;
    const list = byItem.get(card.item_id) ?? [];
    list.push(card);
    byItem.set(card.item_id, list);
  }
  const result: WholeItem[] = [];
  for (const [item_id, itemCards] of Array.from(byItem.entries())) {
    const sorted = itemCards.sort((a, b) => a.part.localeCompare(b.part));
    if (sorted.length < 2) continue;
    result.push({
      item_id,
      source: sorted[0].source,
      parts: sorted.map((c) => ({
        part: c.part,
        prompt: c.prompt,
        primary_type: c.primary_type,
        difficulty: taxonomy[c.primary_type]?.difficulty ?? 0,
      })),
    });
  }
  return result;
}

export function vocabOverlap(text: string, vocab: string[]): number {
  const lower = text.toLowerCase();
  return vocab.filter((v) => lower.includes(v.toLowerCase())).length;
}

/** Related item cards selected by KC-vocabulary overlap (task-type/style priors only). */
export function selectRelatedCards(coreVocab: string[]): Card[] {
  const priors = getABCPriors();
  const priorTypes = new Set(priors.flatMap((p) => p.sequence));
  return getCards()
    .map((c) => ({
      card: c,
      score: vocabOverlap(c.prompt, coreVocab) * 3 + (priorTypes.has(c.primary_type) ? 1 : 0),
    }))
    .filter((sc) => sc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((sc) => sc.card);
}

export function selectRelevantRubrics(
  standard: string,
  coreVocab: string[],
): ItemRubric[] {
  const { item_specific: itemRubrics } = getRubrics();
  const matched = itemRubrics.filter(
    (r) =>
      r.alignment === standard || vocabOverlap(r.scoring_guideline, coreVocab) >= 2,
  );
  return matched.length > 0 ? matched : itemRubrics;
}

export function getStudyGuideChunks(): StudyGuideChunk[] {
  if (_studyGuideChunks) return _studyGuideChunks;
  const raw = fs.readFileSync(dataPath("study_guide_chunks.json"), "utf-8");
  const data = JSON.parse(raw) as { chunks: StudyGuideChunk[] };
  return (_studyGuideChunks = data.chunks);
}

async function initStudyGuideEmbeddings(): Promise<void> {
  if (_chunkEmbeddings) return;
  const chunks = getStudyGuideChunks();
  const batchSize = 20;
  const all: Array<{ chunk: StudyGuideChunk; vec: number[] }> = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const vecs = await Promise.all(batch.map((c) => embedText(c.text)));
    for (let j = 0; j < batch.length; j++) {
      all.push({ chunk: batch[j], vec: vecs[j] });
    }
  }
  _chunkEmbeddings = all;
}

function sampleWithoutReplacement<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const selected: T[] = [];
  while (pool.length > 0 && selected.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    selected.push(pool[index]);
    pool.splice(index, 1);
  }
  return selected;
}

/** C3 retrieval: top-2 fixed + 2 randomized from ranks 3–8 (reference ablation). */
export function selectStudyGuideChunksForCoreKC(
  chunks: RetrievedStudyGuideChunk[],
): RetrievedStudyGuideChunk[] {
  const fixed = chunks.slice(0, 2);
  const randomized = sampleWithoutReplacement(chunks.slice(2, 8), 2);
  return [...fixed, ...randomized].sort((a, b) => b.score - a.score);
}

export async function retrieveStudyGuideForCoreKC(
  coreKC: KC,
  options?: { topK?: number; minScore?: number },
): Promise<RetrievedStudyGuideChunk[]> {
  const topK = options?.topK ?? 8;
  const minScore = options?.minScore ?? 0.25;
  const queryParts = [coreKC.statement, ...coreKC.vocab].filter(Boolean);
  const query = queryParts.join(". ");

  if (!_chunkEmbedInitPromise) {
    _chunkEmbedInitPromise = initStudyGuideEmbeddings();
  }
  await _chunkEmbedInitPromise;

  const qVec = await embedText(query);
  const scored = (_chunkEmbeddings ?? [])
    .map(({ chunk, vec }) => ({
      chunkId: chunk.chunk_id,
      text: chunk.text,
      score: cosineSimilarity(qVec, vec),
    }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return selectStudyGuideChunksForCoreKC(scored);
}
