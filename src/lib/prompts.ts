import type { DOKLevel, DiagramType } from "@/types/question";

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
  dokLevels: DOKLevel[];
  includeDiagrams: boolean;
  diagramConfig: DiagramConfig;
  customPrompt: string;
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

Example B (cycle model style):
"svg": "<svg viewBox='0 0 400 300' xmlns='http://www.w3.org/2000/svg'><rect x='12' y='12' width='376' height='276' fill='none' stroke='#000' stroke-width='2'/><text x='200' y='33' text-anchor='middle' font-size='16' font-weight='bold'>Cycling of Matter</text><rect x='45' y='90' width='105' height='42' fill='none' stroke='#000' stroke-width='2'/><text x='97' y='116' text-anchor='middle' font-size='12'>Producers</text><rect x='250' y='90' width='105' height='42' fill='none' stroke='#000' stroke-width='2'/><text x='302' y='116' text-anchor='middle' font-size='12'>Consumers</text><rect x='145' y='205' width='110' height='40' fill='none' stroke='#000' stroke-width='2'/><text x='200' y='230' text-anchor='middle' font-size='12'>CO2 in air</text><path d='M150 110 C185 70, 215 70, 250 110' fill='none' stroke='#000' stroke-width='2'/><polygon points='250,110 241,107 244,116' fill='#000'/><path d='M302 132 C280 170, 245 188, 220 205' fill='none' stroke='#000' stroke-width='2'/><polygon points='220,205 223,196 229,202' fill='#000'/><path d='M180 205 C145 190, 115 162, 97 132' fill='none' stroke='#000' stroke-width='2'/><polygon points='97,132 105,136 98,142' fill='#000'/></svg>"

Example C (labeled structure style):
"svg": "<svg viewBox='0 0 400 300' xmlns='http://www.w3.org/2000/svg'><text x='200' y='28' text-anchor='middle' font-size='16' font-weight='bold'>Plant Cell (Simplified)</text><rect x='75' y='55' width='250' height='190' rx='12' fill='none' stroke='#000' stroke-width='2.5'/><rect x='95' y='75' width='210' height='150' rx='10' fill='none' stroke='#000' stroke-width='1.8'/><ellipse cx='250' cy='120' rx='28' ry='18' fill='none' stroke='#000' stroke-width='1.8'/><circle cx='252' cy='120' r='6' fill='none' stroke='#000' stroke-width='1.6'/><ellipse cx='145' cy='115' rx='26' ry='14' fill='none' stroke='#000' stroke-width='1.6'/><ellipse cx='150' cy='170' rx='30' ry='16' fill='none' stroke='#000' stroke-width='1.6'/><rect x='190' y='165' width='70' height='45' rx='6' fill='none' stroke='#000' stroke-width='1.6'/><line x1='325' y1='95' x2='280' y2='110' stroke='#000' stroke-width='1.6'/><text x='330' y='95' font-size='12'>nucleus</text><line x1='325' y1='145' x2='270' y2='170' stroke='#000' stroke-width='1.6'/><text x='330' y='146' font-size='12'>vacuole</text><line x1='70' y1='95' x2='95' y2='95' stroke='#000' stroke-width='1.6'/><text x='18' y='99' font-size='12'>cell wall</text></svg>"

Target visual style:
- Similar to clean worksheet diagrams (labeled, monochrome, readable)
- Focus on concept clarity, not artistic detail
- Examples: cell diagrams, plant parts, food webs, carbon cycle, lab apparatus`,
};

export function buildGenerationPrompt(settings: GenerationSettings): string {
  const dokDescriptions = settings.dokLevels
    .map((level) => DOK_DESCRIPTIONS[level])
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
    ? `\n## Additional Instructions\n${settings.customPrompt}\n`
    : "";

  return `You are an expert biology educator creating questions for the Pennsylvania Keystone Biology Exam.

## Task
Generate ${settings.questionCount} multiple-choice questions for high school biology students.

## Topics
Generate questions covering these topics (distribute evenly):
${settings.topics.map((t) => `- ${t}`).join("\n")}

## Standards
Each question must be aligned to exactly one of these standards:
${settings.standards.map((s) => `- ${s}`).join("\n")}

## DOK Levels
Use these Depth of Knowledge levels (distribute evenly):
${dokDescriptions}

## Question Format
Each question must follow this exact JSON structure:

{
  "id": "generated-{topic-slug}-{timestamp}-{index}",
  "module": 1 or 2,
  "topic": "Exact topic name from the list above",
  "standardId": "Exact standard code from the Standards list above",
  "standardLabel": "Short standard description (human readable)",
  "text": "The question text",
  "imageUrl": null,
  "options": [
    {
      "id": "A",
      "text": "Option A text",
      "feedback": "Detailed feedback explaining why this is correct/incorrect"
    },
    {
      "id": "B",
      "text": "Option B text",
      "feedback": "Detailed feedback..."
    },
    {
      "id": "C",
      "text": "Option C text",
      "feedback": "Detailed feedback..."
    },
    {
      "id": "D",
      "text": "Option D text",
      "feedback": "Detailed feedback..."
    }
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

## Glossary Terms (inlineTerms and sidebarTerms)
For each question, identify key biology terms that students might need help with:

1. **inlineTerms**: Terms that appear in the question text or options. These will be highlighted as clickable terms.
   - Include 2-4 terms that are directly mentioned or referenced in the question
   - Choose terms that are central to understanding the question

2. **sidebarTerms**: Related terms that provide additional context (shown in a sidebar glossary).
   - Include 2-4 related concepts that help understand the topic
   - These should complement the inline terms, not duplicate them

For each term, provide:
- **id**: Unique identifier (lowercase, hyphenated, e.g., "active-transport")
- **term**: The display name (e.g., "Active Transport")
- **definition**: A clear, student-friendly definition (1-2 sentences)
- **example**: Optional real-world or concrete example
${diagramInstructions}${customInstructions}
## Requirements
1. Questions must be appropriate for Pennsylvania Keystone Biology Exam
2. All scientific content must be accurate
3. Feedback for each option must be educational and explain WHY the option is correct or incorrect
4. Avoid using "all of the above" or "none of the above" options
5. Each question should test understanding, not just memorization
6. The rationaleQuestion should test WHY the answer is correct, not just recall
7. Every question MUST include exactly one valid "standardId" from the Standards section

## Module Assignment
- Module 1 topics: Basic Biological Principles, Chemical Basis for Life, Bioenergetics, Homeostasis and Transport
- Module 2 topics: Cell Growth and Reproduction, Genetics, Theory of Evolution, Ecology

## Output Format
Return ONLY a valid JSON array of question objects. Do not include any explanation or markdown formatting.
Example: [{ question1 }, { question2 }, ...]`;
}
