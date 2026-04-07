import type { DOKLevel, DiagramType } from "@/types/question";
import { getStandardById } from "@/lib/standards";

interface DiagramConfig {
  chart: number;
  table: number;
  flowchart: number;
  diagram: number;
}

interface GenerationSettings {
  questionSetName: string;
  questionCount: number;
  topics: string[];
  standards: string[];
  standardCounts?: Record<string, number>;
  dokLevels: DOKLevel[];
  includeDiagrams: boolean;
  diagramConfig: DiagramConfig;
  customPrompt: string;
}

function resolveStandardCounts(settings: GenerationSettings): Record<string, number> {
  const selected = settings.standards;
  if (selected.length === 0 || settings.questionCount <= 0) return {};

  const rawCounts = settings.standardCounts ?? {};
  const counts: Record<string, number> = {};
  let total = 0;
  for (const standardId of selected) {
    const value = rawCounts[standardId];
    const normalized =
      typeof value === "number" && Number.isInteger(value) && value >= 0
        ? value
        : 0;
    counts[standardId] = normalized;
    total += normalized;
  }
  if (total === settings.questionCount) return counts;

  const base = Math.floor(settings.questionCount / selected.length);
  let remainder = settings.questionCount % selected.length;
  const distributed: Record<string, number> = {};
  for (const standardId of selected) {
    distributed[standardId] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return distributed;
}

const DOK_DESCRIPTIONS: Record<DOKLevel, string> = {
  1: "DOK 1 (Recall): Questions that require students to recall facts, definitions, or terms. Simple recognition or reproduction of information.",
  2: "DOK 2 (Skill/Concept): Questions that require students to apply concepts, compare, interpret data, or use two or more steps. Requires some decision-making.",
  3: "DOK 3 (Strategic Thinking): Questions that require students to analyze, evaluate, draw conclusions, or justify answers. Requires reasoning and planning.",
};

const DIAGRAM_DESCRIPTIONS: Record<DiagramType, string> = {
  chart: `A chart (line or bar) showing data. Choose line chart for trends over time, bar chart for comparisons.
For line charts, use BOTH single-series and multi-series formats across generated questions.
When line chart is used, prefer 2-4 lines in many cases (similar to Keystone exam style), with a clear legend.
Generate data as:
{
  "type": "chart",
  "data": {
    "chartType": "line" or "bar",
    "title": "Chart Title",
    "xAxisLabel": "X Axis Label",
    "yAxisLabel": "Y Axis Label",
    "series": [{ "key": "seriesA", "label": "Series A" }, { "key": "seriesB", "label": "Series B" }], // required for multi-line charts
    "data": [ ... ]
  }
}

Single-series line chart example (NO "series" field):
{
  "type": "chart",
  "data": {
    "chartType": "line",
    "title": "Single Series Example",
    "xAxisLabel": "Year",
    "yAxisLabel": "Value",
    "data": [
      { "x": "2000", "y": 12 },
      { "x": "2002", "y": 18 },
      { "x": "2004", "y": 25 }
    ]
  }
}

Multi-series line chart example (MUST include "series"; do NOT use "y"):
{
  "type": "chart",
  "data": {
    "chartType": "line",
    "title": "Multi Series Example",
    "xAxisLabel": "Year",
    "yAxisLabel": "Population",
    "series": [
      { "key": "seriesA", "label": "Population A" },
      { "key": "seriesB", "label": "Population B" }
    ],
    "data": [
      { "x": "2000", "seriesValues": { "seriesA": 12, "seriesB": 8 } },
      { "x": "2002", "seriesValues": { "seriesA": 18, "seriesB": 10 } },
      { "x": "2004", "seriesValues": { "seriesA": 25, "seriesB": 14 } }
    ]
  }
}`,
  table: `A data table showing structured information. Generate data as:
{
  "type": "table",
  "data": {
    "title": "Table Title (optional)",
    "headers": ["Column 1", "Column 2", ...],
    "rows": [["cell1", "cell2", ...], ...]
  }
}`,
  flowchart: `A flowchart showing a process or relationships. Generate data as:
{
  "type": "flowchart",
  "data": {
    "title": "Flowchart Title (optional)",
    "nodes": [{ "id": "node1", "label": "Node Label" }, ...],
    "edges": [{ "from": "node1", "to": "node2", "label": "optional label" }, ...]
  }
}`,
  diagram: `A biology diagram (cell structure, plant anatomy, food chain, experiment setup, etc.) as SVG code.
IMPORTANT: The SVG must be black and white only (use stroke="#000" and fill="white" or fill="none").
Generate data as:
{
  "type": "diagram",
  "data": {
    "title": "Diagram Title",
    "svg": "<svg viewBox='0 0 400 300' xmlns='http://www.w3.org/2000/svg'>...black and white SVG content...</svg>"
  }
}

SVG requirements:
- Use viewBox="0 0 400 300" for consistent sizing
- Only use black (#000) for strokes and lines
- Use white (#fff) or none for fills
- Include labels as <text> elements
- The value of "svg" must be a SINGLE-LINE string in JSON (no raw line breaks)
- Prefer single quotes inside SVG attributes (e.g., viewBox='0 0 400 300') to avoid JSON escaping issues
- Keep the diagram simple, educational, and easy to read in an exam context
- Use medium line weight (typically stroke-width="1.5" to "2.5")
- Keep text size readable (typically font-size="12" to "16")
- Prefer clean geometry (line, rect, circle, ellipse, polygon, path only when needed)
- Include arrows for inputs/outputs or cause-effect relationships when relevant
- Add 3-8 labels max; avoid overcrowding
- Do NOT include XML header, DOCTYPE, comments, scripts, external styles, or embedded images
- Do NOT generate massive traced vector art with thousands of path commands

Style examples to imitate (few-shot style guidance; do not copy literally).
IMPORTANT: examples below intentionally follow the single-line JSON string rule and use single quotes in SVG attributes:

Example A (process model style):
"svg": "<svg viewBox='0 0 400 300' xmlns='http://www.w3.org/2000/svg'><rect x='10' y='10' width='380' height='280' fill='white' stroke='#000' stroke-width='2'/><text x='200' y='35' text-anchor='middle' font-size='16' font-weight='bold'>Photosynthesis Model</text><circle cx='75' cy='85' r='24' fill='none' stroke='#000' stroke-width='2'/><text x='75' y='90' text-anchor='middle' font-size='12'>Sun</text><rect x='150' y='75' width='95' height='55' fill='none' stroke='#000' stroke-width='2'/><text x='197' y='105' text-anchor='middle' font-size='13'>Plant</text><line x1='102' y1='85' x2='150' y2='85' stroke='#000' stroke-width='2'/><polygon points='150,85 142,81 142,89' fill='#000'/><text x='112' y='75' font-size='12'>light</text><line x1='245' y1='90' x2='310' y2='65' stroke='#000' stroke-width='2'/><polygon points='310,65 301,64 304,72' fill='#000'/><text x='314' y='63' font-size='12'>O2</text></svg>"
Target visual style:
- Similar to clean worksheet diagrams (labeled, monochrome, readable)
- Focus on concept clarity, not artistic detail
- Examples: cell diagrams, plant parts, food webs, carbon cycle, lab apparatus`,
};

export function buildGenerationPrompt(settings: GenerationSettings): string {
  const selectedDokLevels = [...settings.dokLevels].sort((a, b) => a - b);
  const standardCounts = resolveStandardCounts(settings);
  const dokDescriptions = ([1, 2, 3] as DOKLevel[])
    .map((level) => DOK_DESCRIPTIONS[level])
    .join("\n");
  const standardsWithContext = settings.standards
    .map((standardId) => {
      const standard = getStandardById(standardId);
      if (!standard) return `- ${standardId}`;
      return `- ${standard.id} | targetCount=${standardCounts[standard.id] ?? 0} | Module ${standard.module} | ${standard.category} | ${standard.label}`;
    })
    .join("\n");
  const standardDistributionRule =
    settings.standards.length > 1
      ? "Use targetCount for each standard exactly as listed above."
      : "Use the single selected standard for all questions.";
  const dokPriorityRules = [
    selectedDokLevels.includes(2)
      ? "Prefer DOK 2 for most multiple-choice items."
      : "",
    selectedDokLevels.includes(2) && selectedDokLevels.includes(3)
      ? "If both DOK 2 and DOK 3 are selected, generate mostly DOK 2 and some DOK 3."
      : "",
    selectedDokLevels.includes(1)
      ? "If DOK 1 is selected, keep it contextual and avoid stand-alone vocabulary recall."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  let diagramInstructions = "";
  if (settings.includeDiagrams) {
    const diagramTypes: { type: DiagramType; count: number }[] = [];
    if (settings.diagramConfig.chart > 0) {
      diagramTypes.push({ type: "chart", count: settings.diagramConfig.chart });
    }
    if (settings.diagramConfig.table > 0) {
      diagramTypes.push({ type: "table", count: settings.diagramConfig.table });
    }
    if (settings.diagramConfig.flowchart > 0) {
      diagramTypes.push({
        type: "flowchart",
        count: settings.diagramConfig.flowchart,
      });
    }
    if (settings.diagramConfig.diagram > 0) {
      diagramTypes.push({
        type: "diagram",
        count: settings.diagramConfig.diagram,
      });
    }

    if (diagramTypes.length > 0) {
      diagramInstructions = `
## Diagram Requirements

Some questions must include diagrams. Here are the requirements:

${diagramTypes.map(({ type, count }) => `- ${count} question(s) with ${type}:\n${DIAGRAM_DESCRIPTIONS[type]}`).join("\n\n")}

These counts are MANDATORY and EXACT. Do not deviate.
- If chart is set to N, output exactly N chart questions.
- If table is set to N, output exactly N table questions.
- If flowchart is set to N, output exactly N flowchart questions.
- If diagram is set to N, output exactly N diagram questions.
- Remaining questions (if any) must have "diagram": null.

For questions with diagrams:
1. The question text should reference the diagram (e.g., "Based on the graph shown...", "According to the table...", "The diagram below shows...")
2. The diagram data must be scientifically accurate and relevant to the question
3. Include the "diagram" field in the question JSON with the appropriate type and data
4. ALL diagrams must be BLACK AND WHITE only - no colors
`;
    }
  }

  const customInstructions = settings.customPrompt
    ? `\n## Additional Instructions\nThese may refine content focus, but must NOT override JSON validity, standard alignment, one-best-answer structure, scientific accuracy, diagram counts, or selected DOK constraints.\n${settings.customPrompt}\n`
    : "";

  return `You are an expert biology educator creating questions for the Pennsylvania Keystone Biology Exam.

## Task
Generate ${settings.questionCount} multiple-choice questions for high school biology students.

## Standards
Each question must be aligned to exactly one of these standards:
${standardsWithContext}
${standardDistributionRule}
Each question must assess only one standard.
Avoid repeating the exact same reasoning pattern across multiple questions.

## DOK Levels
Reference definitions:
${dokDescriptions}
Generate questions using ONLY these selected levels: ${selectedDokLevels
    .map((level) => `DOK ${level}`)
    .join(", ")}.
${dokPriorityRules}

## Question Format
Each question must follow this exact JSON structure:

{
  "topic": "Must exactly equal the category of the selected standard",
  "standardId": "Exact standard code from the Standards list above",
  "standardLabel": "Short standard description (human readable)",
  "text": "The question text",
  "imageUrl": null,
  "options": [
    { "id": "A", "text": "Option text", "feedback": "Why correct/incorrect" },
    { "id": "B", "text": "Option text", "feedback": "Why correct/incorrect" },
    { "id": "C", "text": "Option text", "feedback": "Why correct/incorrect" },
    { "id": "D", "text": "Option text", "feedback": "Why correct/incorrect" }
  ],
  "correctOptionId": "A, B, C, or D",
  "focusHint": "A hint to guide student thinking without giving away the answer",
  "keyKnowledge": "The key concept or fact the student should learn from this question",
  "commonMisconception": "A common mistake students make related to this topic",
  "rationaleQuestion": {
    "text": "Which reason best supports your answer?",
    "options": [
      { "id": "A", "text": "Rationale option A" },
      { "id": "B", "text": "Rationale option B" },
      { "id": "C", "text": "Rationale option C" }
    ],
    "correctOptionId": "The correct rationale option",
    "explanation": "Brief explanation of why this rationale is correct"
  },
  "inlineTerms": [
    {
      "id": "term-id-lowercase-hyphenated",
      "term": "Term Name",
      "definition": "Clear, concise definition of the term",
      "example": "A concrete example showing the term in context (optional)"
    }
  ],
  "sidebarTerms": [
    {
      "id": "related-term-id",
      "term": "Related Term",
      "definition": "Definition of a related concept that helps understand the question",
      "example": "Example (optional)"
    }
  ],
  "source": "generated",
  "dok": 1, 2, or 3,
  "isVisible": true,
  "diagram": null or { diagram object if applicable }
}

## Style Example (text-only)
Use this as a style target for clear stem, plausible distractors, and single-best-answer logic:
{
  "text": "A student claims that sugar molecules can be converted directly to proteins because both contain carbon, hydrogen, and oxygen. Which statement best evaluates this claim?",
  "options": [
    { "id": "A", "text": "The claim is incorrect because proteins require nitrogen; cells must add other elements to build proteins.", "feedback": "Correct. Sugars do not contain the nitrogen needed for amino acids and proteins." },
    { "id": "B", "text": "The claim is incorrect because all proteins are enzymes that make sugars.", "feedback": "Incorrect. Not all proteins are enzymes, and this does not address required elements." },
    { "id": "C", "text": "The claim is correct because proteins form DNA, and DNA uses sugar energy.", "feedback": "Incorrect. This does not show that sugars directly become proteins." },
    { "id": "D", "text": "The claim is correct because proteins contain only carbon, hydrogen, and oxygen.", "feedback": "Incorrect. Proteins also require nitrogen." }
  ],
  "correctOptionId": "A"
}

## Reasoning-First Design (critical)
Design each item so students must reason, not just recall a definition:
1. Use a two-part stem: (a) context/data/claim/model, then (b) an inference/prediction/evaluation question.
2. Avoid stand-alone definition prompts (e.g., "What is...", "What are...") unless embedded in a scenario.
3. Require interpretation of a relationship, mechanism, or cause-effect, not term memorization.
4. Make distractors "near-miss" ideas based on common misconceptions, not obviously wrong facts.
5. For DOK 1, still use simple context and evidence-based choice; do not generate pure vocabulary recall items.

## Glossary Terms (inlineTerms and sidebarTerms)
For each question:
- **inlineTerms**: 2-4 key terms used directly in the stem/options.
- **sidebarTerms**: 2-4 related terms that add context (no duplicates of inlineTerms).
- For each term include: **id** (lowercase-hyphenated), **term**, **definition**, optional **example**.
${diagramInstructions}${customInstructions}
## Requirements
1. Questions must be appropriate for Pennsylvania Keystone Biology Exam
2. All scientific content must be accurate
3. Every option must include feedback explaining why it is correct or incorrect
4. Every question MUST include exactly one valid "standardId" from the Standards section
5. The stem and correct-option reasoning must directly assess the selected standard label (not a generic biology fact).

## MCQ Quality Checklist (apply to every question)
1. Write a clear, focused stem that asks one problem.
2. Put the core problem in the stem, not in an option.
3. Make stems substantive (prefer 2+ clauses/sentences with context before the final ask).
4. Ensure all options are parallel in grammar/style and in the same answer category.
5. Ensure exactly one best answer; make all distractors plausible.
6. Keep option length/detail balanced; avoid a noticeably longer "correct" choice.
7. Avoid logical clues (keyword copying, converging combinations, giveaway phrasing).
8. Avoid absolute terms (e.g., always, never, all, only) and vague frequency words unless scientifically required.
9. Avoid negatives (NOT/EXCEPT/incorrect) unless essential for the standard.
10. Do not use "all of the above" or "none of the above".

## Output Format
Return ONLY a valid JSON array of question objects. Do not include any explanation or markdown formatting.
Example: [{ question1 }, { question2 }, ...]`;
}
