/**
 * Blueprint and item generation prompts for Method2 (C3 ablation config:
 * blueprint + study-guide RAG + TELeR L2), ported from the reference
 * `lib/aig/methods/method2-blueprint-rag.ts`.
 *
 * Prompt wording is preserved from the reference to keep item comparability.
 */

import type { StimulusType } from "@/types/short-answer";
import {
  getABCPriors,
  getRubrics,
  getWholeItems,
  vocabOverlap,
  type KC,
  type RetrievedStudyGuideChunk,
  type TaxonomyEntry,
  type ItemRubric,
} from "./data";

/** C3 ablation: Method2 blueprint + study-guide RAG + TELeR L2 item stage. */
export const GENERATION_TELER_LEVEL = 2 as const;

export interface GenerationContext {
  standard: string;
  standardKCs: KC[];
  selectedCoreKC: KC;
  taxonomyRows: Record<string, TaxonomyEntry>;
  relevantRubrics: ItemRubric[];
  studyGuideChunks: RetrievedStudyGuideChunk[];
}

export interface BlueprintPromptOptions {
  stimulusType: StimulusType;
}

export function buildBlueprintPrompt(
  ctx: GenerationContext,
  options: BlueprintPromptOptions,
): { system: string; user: string } {
  const fixedStimulusType = options.stimulusType;

  const system = [
    "You are an expert assessment designer for Pennsylvania Keystone Biology.",
    "Your task is to produce a blueprint for a constructed-response item aligned to ONE selected",
    "standard, with exactly one Knowledge Component (KC) assigned to each part.",
    "",
    "INSTRUCTIONS:",
    "1. Review ALL KCs listed under the target standard.",
    `2. Use the PRESELECTED anchor KC exactly as anchor_kc: ${ctx.selectedCoreKC.code}. Do not choose a different anchor_kc.`,
    "   The anchor KC must be used in at least one of Part A, Part B, or Part C.",
    "   Assign exactly one KC code to each part in task_sequence.",
    "   It is acceptable for multiple parts to use the same KC.",
    "   It is acceptable for all parts to use the same KC.",
    "   If you assign non-anchor KCs, use at most two additional KCs.",
    "   All selected KCs must work naturally with one shared stem/stimulus.",
    "   Do not assign a KC to a part unless that part can be directly assessed from the same item context.",
    "3. Decide part count: default to 3 parts (A, B, C). Use only 2 parts (A, B) only when",
    "   the selected KC combination does not naturally support a third coherent, non-redundant part.",
    "4. KC choice must support the A/B/C progression: Part A should target an entry point that can",
    "   be assessed with a focused, convergent response; Part B should target a mechanism, relationship,",
    "   or explanation; Part C should target transfer, prediction, evidence, design, or evaluation when",
    "   the selected KCs support it.",
    "5. DIFFICULTY RULES (use the Difficulty numbers shown per taxonomy type):",
    "   - task_type must be the exact TYPE name (e.g. 'Recall / Identify / Classify') — do NOT",
    "     append the difficulty number or any other text to the task_type value.",
    "   - Part A MUST be difficulty 1–2 (low entry point, single convergent answer).",
    "   - Difficulty must not decrease: difficulty(A) <= difficulty(B) <= difficulty(C).",
    "   - At most ONE part may be difficulty 4–5.",
    "6. SINGLE-FOCUS RULE (critical — applies to every part's function field):",
    "   - Each part's function must describe EXACTLY ONE thing the student is asked to do.",
    "   - Part A's function must name a single convergent target: one term, one substance, one structure,",
    "     one relationship (e.g. 'identify the molecule that carries the anticodon during translation').",
    "   - Do NOT write a function that chains asks with 'and', 'also', 'as well as', or a comma",
    "     that introduces a second question.",
    "   BAD: 'identify what a codon and anticodon are, and name the matching mechanism'",
    "   GOOD: 'identify the molecule that determines amino-acid order'",
    "   - Part B / Part C may describe or explain, but still about ONE mechanism or concept in depth.",
    "   BAD Part B: 'explain how transcription works and how translation differs from it'",
    "   GOOD Part B: 'explain how the anticodon ensures the correct amino acid is added'",
    "7. cognitive_demand: Low / Low-Mod / Moderate / High — from the assigned KCs and task sequence.",
    "8. key_concepts from assigned KC vocab + study-guide grounding. Do NOT invent biology.",
    "9. expected_response_elements and common_incomplete_responses grounded in assigned KCs and study guide.",
    `10. Stimulus constraint: You MUST use stimulus type "${fixedStimulusType}". Do not choose a different stimulus type.`,
    `11. Use the requested stimulus_type exactly: ${fixedStimulusType}. Do not choose a different stimulus_type.`,
    "12. EVERY top-level schema key is mandatory. Never omit any field shown in the JSON schema.",
    "13. evidence_pattern is required on every response. It should briefly name the planned stimulus/evidence form,",
    "    such as 'monochrome line graph of rate over time', 'black-and-white comparison table', or 'scenario with concrete observations'.",
    "",
    "OUTPUT: strict JSON only, no markdown, matching exactly:",
    JSON.stringify({
      target_standard: "<standard code e.g. 3.1.9-12.A>",
      anchor_kc: "<preselected anchor KC code; must be used in at least one part>",
      core_kc: "<same value as anchor_kc, included for backward compatibility>",
      selected_kcs: ["<all unique KC codes assigned to Part A/B/C; max 3 total>"],
      supporting_kcs: ["<optional non-anchor KC codes assigned to at least one part; max 2>"],
      stem_affordance: "<brief description of the shared context/stimulus that makes these part KCs cohere>",
      compatibility_rationale: "<brief reason the assigned KCs work naturally with one shared stem/stimulus>",
      cognitive_demand: "<Low | Low-Mod | Moderate | High>",
      key_concepts: ["<concept from assigned KC vocab/study guide>"],
      task_sequence: {
        "Part A": { kc_code: "<one selected KC code>", task_type: "<exact TYPE name, difficulty 1-2, no annotation>", function: "<ONE single-focus target — one term/substance/structure>" },
        "Part B": { kc_code: "<one selected KC code>", task_type: "<exact TYPE name, difficulty >= Part A, no annotation>", function: "<ONE mechanism or relationship — no 'and' chaining>" },
        "Part C": { kc_code: "<one selected KC code>", task_type: "<exact TYPE name, difficulty >= Part B, no annotation>", function: "<ONE evaluation, prediction, or synthesis point>" },
      },
      stimulus_type: fixedStimulusType,
      evidence_pattern: "<type of stimulus or evidence the item will use>",
      expected_response_elements: ["<specific element students must include>"],
      common_incomplete_responses: ["<typical student error or omission>"],
    }),
  ].join("\n");

  const kcListSection = ctx.standardKCs
    .map((kc) => `  ${kc.code}: ${kc.statement}\n    Vocab: ${kc.vocab.join(", ")}`)
    .join("\n");

  const selectedCoreSection = [
    `Selected anchor KC: ${ctx.selectedCoreKC.code}`,
    `Statement: ${ctx.selectedCoreKC.statement}`,
    `Vocab: ${ctx.selectedCoreKC.vocab.join(", ") || "(none)"}`,
    "The blueprint JSON anchor_kc value must exactly match this selected anchor KC.",
    "The blueprint JSON core_kc value must match anchor_kc for backward compatibility.",
  ].join("\n");

  const taxonomySection = Object.entries(ctx.taxonomyRows)
    .sort(([, a], [, b]) => a.difficulty - b.difficulty)
    .map(
      ([name, entry]) =>
        `TYPE: ${name}\nDifficulty: ${entry.difficulty}\nDefinition: ${entry.definition}\nScaffolding: ${entry.scaffolding}`,
    )
    .join("\n\n");

  const priors = getABCPriors();
  const priorSeqSection = priors
    .map((p) => {
      const diffLabels = p.sequence.map((t) => {
        const d = ctx.taxonomyRows[t]?.difficulty ?? "?";
        return `${t} [d${d}]`;
      });
      return `${p.item}: A=${diffLabels[0] ?? "?"} -> B=${diffLabels[1] ?? "?"} -> C=${diffLabels[2] ?? "—"}`;
    })
    .join("\n");

  const combinedVocab = ctx.selectedCoreKC.vocab.length
    ? ctx.selectedCoreKC.vocab
    : ctx.standardKCs.flatMap((kc) => kc.vocab);
  const wholeItemSection = getWholeItems()
    .map((item) => ({
      item,
      score: item.parts.reduce((s, p) => s + vocabOverlap(p.prompt, combinedVocab), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ item }) =>
      [
        `ITEM ${item.item_id} (${item.source}):`,
        ...item.parts.map(
          (p) => `  Part ${p.part} [${p.primary_type} d${p.difficulty}]: ${p.prompt}`,
        ),
      ].join("\n"),
    )
    .join("\n---\n");

  const studyGuideSection =
    ctx.studyGuideChunks.length > 0
      ? ctx.studyGuideChunks
          .map((c) => `[${c.chunkId} | score=${c.score.toFixed(2)}]\n${c.text}`)
          .join("\n---\n")
      : "(No study-guide chunks retrieved above threshold — use KC statements and vocabulary only.)";

  const user = [
    "=== TARGET STANDARD ===",
    `Standard: ${ctx.standard}`,
    `KCs under this standard (${ctx.standardKCs.length} total):`,
    kcListSection,
    "",
    "=== PRESELECTED ANCHOR KC ===",
    selectedCoreSection,
    "",
    "=== 12 TAXONOMY TYPES (choose task_types only from these) ===",
    taxonomySection,
    "",
    "=== OBSERVED A/B/C SEQUENCES (use as prior, not fixed) ===",
    priorSeqSection || "(none)",
    "",
    "=== WHOLE-ITEM EXEMPLARS (observe how each real item stays on one concept and escalates difficulty) ===",
    wholeItemSection || "(none)",
    "",
    "=== STUDY-GUIDE GROUNDING (use to ground key_concepts and expected elements) ===",
    studyGuideSection,
    "",
    `=== FIXED STIMULUS TYPE ===\n${fixedStimulusType}`,
    "",
    "Produce the blueprint JSON now.",
  ].join("\n");

  return { system, user };
}

interface BlueprintForItem {
  stimulus_type: StimulusType;
  key_concepts: string[];
  evidence_pattern: string;
  expected_response_elements: string[];
  common_incomplete_responses: string[];
  selected_kcs: string[];
  task_sequence: Record<
    string,
    { kc_code: string; task_type: string; function: string } | undefined
  >;
}

function stimulusGenerationRules(type: StimulusType): string[] {
  const common = [
    "For every stimulus type, provide stimulus_asset.title as a short Keystone-style figure title.",
    "The title should be a concise noun phrase such as 'Investigation Setup', 'Seed Production', or 'Heart Rate of a Black Bear'.",
    "All stimuli must use a black-and-white worksheet style: black, white, and gray only, no color, no decorative gradients, no shadows.",
    `Use exactly stimulus_asset.type="${type}". Do not choose a different stimulus type.`,
  ];
  if (type === "table") {
    return [
      ...common,
      "Provide table_markdown as a GFM table with concise column headers and specific values.",
      "Use table when condition/value data or categorical measurements are the evidence students should cite.",
      "Only populate table_markdown; omit chart_data, diagram_spec, scenario_text, and illustration_prompt.",
    ];
  }
  if (type === "line_graph") {
    return [
      ...common,
      "Provide chart_data for a line graph with clear x_label, y_label, and at least 3 labeled points.",
      "Use line_graph for trends over time, dose, temperature, concentration, or another continuous variable.",
      "Only populate chart_data; omit table_markdown, diagram_spec, scenario_text, and illustration_prompt.",
    ];
  }
  if (type === "bar_chart") {
    return [
      ...common,
      "Provide chart_data for a bar chart comparing discrete categories, groups, treatments, or conditions.",
      "Use concise category labels and realistic numeric values.",
      "Only populate chart_data; omit table_markdown, diagram_spec, scenario_text, and illustration_prompt.",
    ];
  }
  if (type === "scenario") {
    return [
      ...common,
      "Provide scenario_text with 3-5 sentences, named organisms or context, and at least one concrete observation or measurement.",
      "Use scenario when qualitative evidence is enough and a chart/diagram would be artificial.",
      "Only populate scenario_text; omit table_markdown, chart_data, diagram_spec, and illustration_prompt.",
    ];
  }
  if (type === "diagram") {
    return [
      ...common,
      "Provide diagram_spec as a complete SVG string for a simple flowchart, cycle, structure, or pathway schematic.",
      "Use ONLY when the structure is simple enough to represent clearly with boxes/circles/arrows.",
      "Start with <svg width='540' height='320' xmlns='http://www.w3.org/2000/svg'>.",
      "The SVG must be self-contained and valid with no prose before or after it.",
      "Do NOT include the title text inside the SVG; the app renders the title above the figure.",
      "Use black, white, and gray only. No colored fills or colored strokes.",
      "Use <rect>, <circle>, <path>, <line>, <polygon>, <text>, and <marker> for arrows.",
      "Do NOT include <script> or event handlers.",
      "LAYOUT RULES - strictly follow to avoid overlapping elements:",
      "  - Keep all elements within x in [10,530] and y in [10,310]. Never place anything outside this.",
      "  - Space nodes at least 80px apart center-to-center.",
      "  - Place each text label at the CENTER of its shape using text-anchor='middle' and dominant-baseline='middle'.",
      "  - If a label exceeds 12 characters, split it into two <tspan> lines.",
      "  - Use rectangles or ellipses for multi-word labels. Avoid circles for long labels.",
      "  - Arrow lines must start and end OUTSIDE the shape border, not at the center.",
      "Only populate diagram_spec; omit table_markdown, chart_data, scenario_text, and illustration_prompt.",
    ];
  }
  return [
    ...common,
    "Provide illustration_prompt for a black-and-white Keystone exam figure on a plain white background.",
    "Use illustration for complex biological visuals such as cells, organelles, organisms, tissues, habitats, or realistic molecular models.",
    "Do NOT include a title inside the generated image; the app renders the title above the figure.",
    "Only populate illustration_prompt; omit table_markdown, chart_data, diagram_spec, and scenario_text.",
  ];
}

export function buildItemPrompt(
  bp: BlueprintForItem,
  ctx: GenerationContext,
  telerLevel: number = GENERATION_TELER_LEVEL,
): { system: string; user: string } {
  const partCount = (["Part A", "Part B", "Part C"] as const).filter(
    (p) => bp.task_sequence[p],
  ).length;

  const partSchema: Record<string, { task_type: string; question: string }> = {
    "Part A": { task_type: "<from blueprint>", question: "<student-facing question>" },
    "Part B": { task_type: "<from blueprint>", question: "<student-facing question>" },
  };
  if (bp.task_sequence["Part C"]) {
    partSchema["Part C"] = {
      task_type: "<from blueprint>",
      question: "<student-facing question>",
    };
  }

  const partRubricTemplate =
    partCount === 2
      ? {
          "Part A": { points_possible: 1, criteria: { "1": "Concrete Part A credit criterion", "0": "No credit criterion" } },
          "Part B": { points_possible: 2, criteria: { "2": "Complete Part B credit criterion", "1": "Partial Part B credit criterion", "0": "No credit criterion" } },
        }
      : {
          "Part A": { points_possible: 1, criteria: { "1": "Concrete Part A credit criterion", "0": "No credit criterion" } },
          "Part B": { points_possible: 1, criteria: { "1": "Concrete Part B credit criterion", "0": "No credit criterion" } },
          "Part C": { points_possible: 1, criteria: { "1": "Concrete Part C credit criterion", "0": "No credit criterion" } },
        };

  const vocabTerms = Array.from(
    new Set(
      ctx.standardKCs
        .filter((kc) => bp.selected_kcs.includes(kc.code))
        .flatMap((kc) => kc.vocab),
    ),
  );

  const telerSystemInstruction =
    telerLevel <= 2
      ? "Use the KC statements, key concepts, and rubric anchors as the primary content constraints. Keep the prompt-level guidance intentionally light."
      : "Ground all scientific content in the study-guide chunks and key concepts provided. Do NOT invent biology outside those sources.";

  const telerUserSection =
    telerLevel <= 2
      ? `(TELeR L${telerLevel}: study-guide details and expected response elements are intentionally withheld.)`
      : telerLevel >= 4
        ? [
            `=== EXPECTED RESPONSE ELEMENTS (TELeR L${telerLevel}) ===`,
            bp.expected_response_elements.join("\n"),
            "",
            `=== COMMON INCOMPLETE RESPONSES (TELeR L${telerLevel}) ===`,
            bp.common_incomplete_responses.join("\n"),
          ].join("\n")
        : `(TELeR L${telerLevel}: expected_response_elements NOT provided — derive scoring criteria from KC and blueprint only.)`;

  const system = [
    "You are an expert item writer for Pennsylvania Keystone Biology Keystone exams.",
    `Generate a ${partCount}-part constructed-response item from the provided blueprint.`,
    "",
    "ITEM WRITING RULES:",
    "1. Stem must set the biological context without giving away the answers.",
    `2. Use the blueprint stimulus_type exactly: ${bp.stimulus_type}.`,
    ...stimulusGenerationRules(bp.stimulus_type).map((line) => `   ${line}`),
    "3. SINGLE-FOCUS RULE (critical — strictly enforced):",
    "   Each part asks for EXACTLY ONE thing. The student's answer converges on a single concept,",
    "   term, mechanism, or relationship. Do NOT chain sub-questions with 'and', 'also',",
    "   'as well as', or commas that introduce a second question.",
    "   - Part A must have a single convergent answer (one term / one substance / one structure).",
    "   - Part B / Part C may use 'describe', 'explain', or 'give an example', but still about",
    "     ONE core point.",
    "   Each part must target its assigned KC while staying coherent with the same shared item context.",
    "4. Each part question must match its task_type and target the KC assigned in the blueprint (kc_code).",
    "5. Write per-part analytic rubrics only. Do not write a holistic rubric.",
    "   The part_rubrics points_possible values must sum to 3. For 3-part items use 1 point per part; for 2-part items assign 1 point to Part A and 2 points to Part B.",
    "   Also provide annotated_responses for total scores 0, 1, 2, and 3. Each annotation must explain why that sample earns that total score.",
    "   IMPORTANT: the part_rubrics template shown in the schema is only a shape guide.",
    "   You must replace every placeholder with concrete biology-specific credit criteria for THIS item.",
    "   Do NOT output [bullet A], [bullet B], [bullet C], [Part A concept], or any other unresolved template text.",
    "6. Use a specific, plausible biology context when possible; avoid generic textbook-only scenarios if a concrete investigation or organism/system context preserves alignment.",
    "7. Do NOT reveal expected answers in the stem, stimulus asset, or part questions.",
    telerSystemInstruction,
    `8. Stimulus type is fixed by the blueprint: ${bp.stimulus_type}.`,
    "9. Provide 3-6 key_terms: important vocabulary words that appear in this item (prefer words",
    "   from the VOCABULARY list below, if provided). Each term needs its OWN concise, one-sentence",
    "   definition written specifically for that term. Do NOT reuse the same definition text for",
    "   more than one term, and do NOT copy a KC statement verbatim as a definition — write an",
    "   actual definition of the word itself.",
    "",
    "OUTPUT: strict JSON only, no markdown wrapper, matching exactly:",
    JSON.stringify({
      stem: "<biological context sentence(s)>",
      stimulus_asset: {
        type: bp.stimulus_type,
        title: "<short Keystone-style figure title, 2-8 words>",
        table_markdown: "<GFM table string — only when type=table, else omit>",
        chart_data: {
          x_label: "<axis label>",
          y_label: "<axis label>",
          series: [{ name: "<series name>", points: [["<x>", 0]] }],
        },
        diagram_spec: "<complete SVG string — only when type=diagram, else omit>",
        scenario_text: "<scenario stimulus text — only when type=scenario, else omit>",
        illustration_prompt: "<image-generation prompt string — only when type=illustration, else omit>",
      },
      parts: partSchema,
      part_rubrics: partRubricTemplate,
      annotated_responses: [
        { score: 3, response: "Full-credit sample student response", annotation: "Why it earns 3 points" },
        { score: 2, response: "Two-point sample student response", annotation: "Why it earns 2 points" },
        { score: 1, response: "One-point sample student response", annotation: "Why it earns 1 point" },
        { score: 0, response: "Zero-point sample student response", annotation: "Why it earns 0 points" },
      ],
      key_terms: [
        { term: "<vocabulary term used in this item>", definition: "<unique one-sentence definition for this term>" },
      ],
    }),
  ].join("\n");

  const studyGuideSection =
    ctx.studyGuideChunks.length > 0
      ? ctx.studyGuideChunks.map((c) => `[${c.chunkId}]\n${c.text}`).join("\n---\n")
      : "(No study-guide chunks above threshold — use KC statements and key concepts only.)";

  const rubricAnchors = [
    `GENERAL RUBRIC FRAMEWORK:\n${getRubrics().general}`,
    ...ctx.relevantRubrics.map(
      (r) => `STYLE ANCHOR — ${r.item} (${r.alignment}, DOK ${r.dok}):\n${r.scoring_guideline}`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

  const partLines = (["Part A", "Part B", "Part C"] as const)
    .filter((p) => bp.task_sequence[p])
    .map((p) => {
      const part = bp.task_sequence[p]!;
      return `${p}: [${part.kc_code}] ${part.task_type} — ${part.function}`;
    })
    .join("\n");

  const user = [
    "=== BLUEPRINT ===",
    JSON.stringify(bp, null, 2),
    "",
    "=== KEY CONCEPTS (ground item content here) ===",
    bp.key_concepts.join(", "),
    "",
    "=== TASK SEQUENCE (kc_code -> task_type — function) ===",
    partLines,
    "",
    "=== EVIDENCE PATTERN ===",
    bp.evidence_pattern,
    "",
    "=== VOCABULARY (choose 3-6 for key_terms; each needs its own unique definition) ===",
    vocabTerms.length > 0
      ? vocabTerms.join(", ")
      : "(none provided — choose the most important terms from the item context)",
    "",
    "=== FIXED STIMULUS TYPE ===",
    bp.stimulus_type,
    "",
    telerUserSection,
    "",
    "=== RUBRIC ANCHORS (align format and bullet style) ===",
    rubricAnchors,
    "",
    telerLevel <= 2 ? "" : "=== STUDY-GUIDE GROUNDING ===",
    telerLevel <= 2 ? "" : studyGuideSection,
    "",
    "Generate the item JSON now.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { system, user };
}
