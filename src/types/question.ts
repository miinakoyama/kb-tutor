export type QuestionType = "mcq" | "open-ended";

export type PracticeMode = "guided" | "practice" | "adaptive" | "exam" | "review";

export type QuestionSource = "manual" | "imported" | "generated";

export type DOKLevel = 1 | 2 | 3;

export type DiagramType = "chart" | "table" | "flowchart" | "diagram";

export interface MCQOption {
  id: string;
  text: string;
  feedback?: string;
}

export interface LineChartData {
  title: string;
  xAxisLabel: string;
  yAxisLabel: string;
  data: { x: string | number; y: number }[];
}

export interface BarChartData {
  title: string;
  xAxisLabel: string;
  yAxisLabel: string;
  data: { label: string; value: number }[];
}

export interface TableData {
  title?: string;
  headers: string[];
  rows: string[][];
}

export interface FlowchartData {
  title?: string;
  nodes: { id: string; label: string; x?: number; y?: number }[];
  edges: { from: string; to: string; label?: string }[];
}

export interface SvgDiagramData {
  title?: string;
  svg: string;
}

export interface ChartData {
  chartType: "line" | "bar";
  title: string;
  xAxisLabel: string;
  yAxisLabel: string;
  // Single-series format (backward compatible): use `y`.
  // Multi-series line chart format: include `series` and `seriesValues`.
  series?: { key: string; label: string }[];
  data: Array<{
    x: string | number;
    y?: number;
    label?: string;
    seriesValues?: Record<string, number>;
  }>;
}

export interface Diagram {
  type: DiagramType;
  data: ChartData | TableData | FlowchartData | SvgDiagramData;
}

export interface QuestionSet {
  id: string;
  name: string;
  source: QuestionSource;
  createdAt: string;
  questionIds: string[];
  generationConfig?: GenerationConfig;
}

export interface GenerationConfig {
  topics: string[];
  standards?: string[];
  dokLevels: DOKLevel[];
  questionCount: number;
  diagramConfig?: {
    chart: number;
    table: number;
    flowchart: number;
    diagram: number;
  };
  customPrompt?: string;
}

export interface HintLevels {
  goal: string;
  principle: string;
  application: string;
  bottomOut: string;
}

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  example?: string;
  imageUrl?: string | null;
  relatedConcepts?: string[];
}

export interface RationaleQuestion {
  text: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
}

export interface Question {
  id: string;
  module: number;
  topic: string;
  standardId?: string;
  standardLabel?: string;
  text: string;
  imageUrl: string | null;
  options: MCQOption[];
  correctOptionId: string;
  explanation?: string;
  commonMisconception?: string;
  hints?: HintLevels;
  questionType?: QuestionType;

  inlineTerms?: GlossaryTerm[];
  sidebarTerms?: GlossaryTerm[];
  focusHint?: string;
  keyKnowledge?: string;

  rationaleQuestion?: RationaleQuestion;

  misconceptionId?: string;
  relatedQuestionIds?: string[];

  source: QuestionSource;
  questionSetId?: string;
  dok?: DOKLevel;
  isVisible?: boolean;
  generatedAt?: string;
  diagram?: Diagram;
}

export type ConfidenceLevel = "not_sure" | "somewhat" | "sure";

export interface AnswerRecord {
  selectedOptionId: string;
  isCorrect: boolean;
  confidenceLevel?: ConfidenceLevel;
  rationaleAnswer?: { selectedOptionId: string; isCorrect: boolean };
  flagged?: boolean;
  reviewLater?: boolean;
  timeSpentMs?: number;
}

export interface SessionConfig {
  mode: PracticeMode;
  moduleId?: number;
  topicName?: string;
  questionCount?: number;
  showTimer?: boolean;
}

export interface TopicInfo {
  name: string;
  description: string;
  keywords: string[];
}

export const TOPIC_DATA: Record<string, Omit<TopicInfo, "name">> = {
  "Basic Biological Principles": {
    description:
      "Identifying the characteristics of life, distinguishing between prokaryotic and eukaryotic cells, and understanding the levels of biological organization.",
    keywords: ["Prokaryote vs. Eukaryote", "Levels of Organization", "Characteristics of Life"],
  },
  "Chemical Basis for Life": {
    description:
      "Covers biochemistry, the unique properties of water, and the structure and function of major macromolecules such as carbohydrates, lipids, proteins, and nucleic acids.",
    keywords: ["Macromolecules", "Properties of Water", "Enzymes"],
  },
  "Bioenergetics": {
    description:
      "How cells process energy through photosynthesis and cellular respiration.",
    keywords: ["Photosynthesis", "Cellular Respiration", "ATP / Energy Transfer"],
  },
  "Homeostasis and Transport": {
    description:
      "Cell membrane's role in maintaining equilibrium through active and passive transport mechanisms.",
    keywords: ["Active & Passive Transport", "Cell Membrane", "Osmosis"],
  },
  "Cell Growth and Reproduction": {
    description:
      "Cell cycle, including the stages of mitosis, meiosis, and cytokinesis.",
    keywords: ["Cell Cycle (Mitosis)", "Meiosis", "Cytokinesis"],
  },
  "Genetics": {
    description:
      "DNA and RNA structure, protein synthesis (transcription and translation), Mendelian inheritance, and the impact of genetic mutations.",
    keywords: ["DNA Replication", "Protein Synthesis", "Mendelian Inheritance"],
  },
  "Theory of Evolution": {
    description:
      "Mechanisms like natural selection and the evidence supporting the theory of evolution.",
    keywords: ["Natural Selection", "Evidence of Evolution", "Speciation"],
  },
  "Ecology": {
    description:
      "Interactions between organisms and their environment, the flow of energy through ecosystems, and the cycling of matter.",
    keywords: ["Food Webs & Energy Flow", "Biogeochemical Cycles", "Ecosystem Dynamics"],
  },
};

export const MODULES = [
  {
    id: 1,
    topics: [
      "Basic Biological Principles",
      "Chemical Basis for Life",
      "Bioenergetics",
      "Homeostasis and Transport",
    ],
  },
  {
    id: 2,
    topics: [
      "Cell Growth and Reproduction",
      "Genetics",
      "Theory of Evolution",
      "Ecology",
    ],
  },
] as const;
