export interface StandardInfo {
  id: string;
  label: string;
  module: "A" | "B";
  category: string;
}

export const STANDARD_DEFINITIONS: StandardInfo[] = [
  {
    id: "3.1.9-12.A",
    label: "DNA structure determines protein structure and function",
    module: "A",
    category: "Structure and Function",
  },
  {
    id: "3.1.9-12.B",
    label: "Hierarchical organization of interacting systems in multicellular organisms",
    module: "A",
    category: "Structure and Function",
  },
  {
    id: "3.1.9-12.C",
    label: "Feedback mechanisms maintain homeostasis",
    module: "A",
    category: "Structure and Function",
  },
  {
    id: "3.1.9-12.E",
    label: "Photosynthesis transforms light energy into chemical energy",
    module: "A",
    category: "Matter and Energy in Organisms and Ecosystems",
  },
  {
    id: "3.1.9-12.F",
    label: "Formation of large carbon-based molecules from sugar molecules",
    module: "A",
    category: "Matter and Energy in Organisms and Ecosystems",
  },
  {
    id: "3.1.9-12.G",
    label: "Cellular respiration and net energy transfer",
    module: "A",
    category: "Matter and Energy in Organisms and Ecosystems",
  },
  {
    id: "3.1.9-12.H",
    label: "Cycling of matter and flow of energy in ecosystems",
    module: "A",
    category: "Matter and Energy in Organisms and Ecosystems",
  },
  {
    id: "3.1.9-12.I",
    label: "Factors affecting carrying capacity at different scales",
    module: "A",
    category: "Interdependent Relationships in Ecosystems",
  },
  {
    id: "3.1.9-12.J",
    label: "Cycling of matter and energy in aerobic/anaerobic conditions",
    module: "A",
    category: "Matter and Energy in Organisms and Ecosystems",
  },
  {
    id: "3.1.9-12.K",
    label: "Photosynthesis and respiration in carbon cycling",
    module: "A",
    category: "Matter and Energy in Organisms and Ecosystems",
  },
  {
    id: "3.1.9-12.L",
    label: "Factors affecting biodiversity and populations",
    module: "A",
    category: "Interdependent Relationships in Ecosystems",
  },
  {
    id: "3.1.9-12.M",
    label: "Ecosystem stability and changing conditions",
    module: "A",
    category: "Interdependent Relationships in Ecosystems",
  },
  {
    id: "3.1.9-12.D",
    label: "Role of mitosis and differentiation in complex organisms",
    module: "B",
    category: "Inheritance and Variation of Traits",
  },
  {
    id: "3.1.9-12.N",
    label: "Reduce impacts of human activities on environment and biodiversity",
    module: "B",
    category: "Interdependent Relationships in Ecosystems",
  },
  {
    id: "3.1.9-12.O",
    label: "Role of group behavior in survival and reproduction",
    module: "B",
    category: "Interdependent Relationships in Ecosystems",
  },
  {
    id: "3.1.9-12.P",
    label: "DNA/chromosomes in inherited traits",
    module: "B",
    category: "Inheritance and Variation of Traits",
  },
  {
    id: "3.1.9-12.Q",
    label: "Sources of inheritable genetic variation",
    module: "B",
    category: "Inheritance and Variation of Traits",
  },
  {
    id: "3.1.9-12.R",
    label: "Statistics/probability for trait variation",
    module: "B",
    category: "Inheritance and Variation of Traits",
  },
  {
    id: "3.1.9-12.S",
    label: "Evidence for common ancestry and biological evolution",
    module: "B",
    category: "Natural Selection and Evolution",
  },
  {
    id: "3.1.9-12.T",
    label: "Four factors driving evolution",
    module: "B",
    category: "Natural Selection and Evolution",
  },
  {
    id: "3.1.9-12.U",
    label: "Probability/statistics in advantageous heritable traits",
    module: "B",
    category: "Natural Selection and Evolution",
  },
  {
    id: "3.1.9-12.V",
    label: "Simulation for mitigating human impacts on biodiversity",
    module: "B",
    category: "Interdependent Relationships in Ecosystems",
  },
  {
    id: "3.1.9-12.W",
    label: "Natural selection leads to population adaptation",
    module: "B",
    category: "Natural Selection and Evolution",
  },
  {
    id: "3.1.9-12.X",
    label: "Environmental change and species outcomes",
    module: "B",
    category: "Natural Selection and Evolution",
  },
];

const STANDARD_MAP = new Map(STANDARD_DEFINITIONS.map((item) => [item.id, item]));

const TOPIC_TO_STANDARD_IDS: Record<string, string[]> = {
  "Basic Biological Principles": ["3.1.9-12.A", "3.1.9-12.B"],
  "Chemical Basis for Life": ["3.1.9-12.F"],
  Bioenergetics: ["3.1.9-12.E", "3.1.9-12.G", "3.1.9-12.J", "3.1.9-12.K"],
  "Homeostasis and Transport": ["3.1.9-12.C"],
  "Cell Growth and Reproduction": ["3.1.9-12.D"],
  Genetics: ["3.1.9-12.P", "3.1.9-12.Q", "3.1.9-12.R"],
  "Theory of Evolution": [
    "3.1.9-12.S",
    "3.1.9-12.T",
    "3.1.9-12.U",
    "3.1.9-12.W",
    "3.1.9-12.X",
  ],
  Ecology: [
    "3.1.9-12.H",
    "3.1.9-12.I",
    "3.1.9-12.L",
    "3.1.9-12.M",
    "3.1.9-12.N",
    "3.1.9-12.O",
    "3.1.9-12.V",
  ],
};

export function getAllStandards(): StandardInfo[] {
  return STANDARD_DEFINITIONS;
}

export function getStandardById(standardId: string): StandardInfo | undefined {
  return STANDARD_MAP.get(standardId);
}

export function getStandardsForTopic(topic: string): StandardInfo[] {
  const ids = TOPIC_TO_STANDARD_IDS[topic] ?? [];
  return ids
    .map((id) => STANDARD_MAP.get(id))
    .filter((item): item is StandardInfo => item !== undefined);
}

export function getDefaultStandardForTopic(topic: string): StandardInfo {
  const mapped = getStandardsForTopic(topic);
  if (mapped.length > 0) return mapped[0];
  const fallback = STANDARD_DEFINITIONS[0];
  return fallback;
}

export function getStandardForTopic(topic: string): StandardInfo {
  return getDefaultStandardForTopic(topic);
}
