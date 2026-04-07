export interface StandardInfo {
  id: string;
  label: string;
  module: "A" | "B";
  category: string;
}

export type ModuleCode = StandardInfo["module"];

export const MODULE_TITLES: Record<ModuleCode, string> = {
  A: "Molecules to Organisms - Structures, Functions, and Natural Cycles",
  B: "Continuity and Unity of Life - Biodiversity, Genetics, and Changes over Time",
};

export const STANDARD_DEFINITIONS: StandardInfo[] = [
  {
    id: "3.1.9-12.A",
    label:
      "Construct an explanation based on evidence for how the structure of DNA determines the structure of proteins, which carry out the essential functions of life through systems of specialized cells.",
    module: "A",
    category: "Structure and Function",
  },
  {
    id: "3.1.9-12.B",
    label:
      "Develop and use a model to illustrate the hierarchical organization of interacting systems that provide specific functions within multicellular organisms.",
    module: "A",
    category: "Structure and Function",
  },
  {
    id: "3.1.9-12.C",
    label:
      "Plan and conduct an investigation to provide evidence that feedback mechanisms maintain homeostasis.",
    module: "A",
    category: "Structure and Function",
  },
  {
    id: "3.1.9-12.E",
    label:
      "Use a model to illustrate how photosynthesis transforms light energy into stored chemical energy.",
    module: "A",
    category: "Matter and Energy in Organisms and Ecosystems",
  },
  {
    id: "3.1.9-12.F",
    label:
      "Construct and revise an explanation based on evidence for how carbon, hydrogen, and oxygen from sugar molecules may combine with other elements to form amino acids and/or other large carbon-based molecules.",
    module: "A",
    category: "Matter and Energy in Organisms and Ecosystems",
  },
  {
    id: "3.1.9-12.G",
    label:
      "Use a model to illustrate that cellular respiration is a chemical process whereby the bonds of food molecules and oxygen molecules are broken and the bonds in new compounds are formed resulting in a net transfer of energy.",
    module: "A",
    category: "Matter and Energy in Organisms and Ecosystems",
  },
  {
    id: "3.1.9-12.H",
    label:
      "Use mathematical representations to support claims for the cycling of matter and flow of energy among organisms in an ecosystem.",
    module: "A",
    category: "Matter and Energy in Organisms and Ecosystems",
  },
  {
    id: "3.1.9-12.I",
    label:
      "Use mathematical and/or computational representations to support explanations of factors that affect carrying capacity of ecosystems at different scales.",
    module: "A",
    category: "Interdependent Relationships in Ecosystems",
  },
  {
    id: "3.1.9-12.J",
    label:
      "Construct and revise an explanation based on evidence for the cycling of matter and flow of energy in aerobic and anaerobic conditions.",
    module: "A",
    category: "Matter and Energy in Organisms and Ecosystems",
  },
  {
    id: "3.1.9-12.K",
    label:
      "Develop a model to illustrate the role of photosynthesis and cellular respiration in the cycling of carbon among the biosphere, atmosphere, hydrosphere, and geosphere.",
    module: "A",
    category: "Matter and Energy in Organisms and Ecosystems",
  },
  {
    id: "3.1.9-12.L",
    label:
      "Use mathematical representations to support and revise explanations based on evidence about factors affecting biodiversity and populations in ecosystems of different scales.",
    module: "A",
    category: "Interdependent Relationships in Ecosystems",
  },
  {
    id: "3.1.9-12.M",
    label:
      "Evaluate the claims, evidence, and reasoning that the complex interactions in ecosystems maintain relatively consistent numbers and types of organisms in stable conditions, but changing conditions may result in a new ecosystem.",
    module: "A",
    category: "Interdependent Relationships in Ecosystems",
  },
  {
    id: "3.1.9-12.D",
    label:
      "Use a model to illustrate the role of cellular division (mitosis) and differentiation in producing and maintaining complex organisms.",
    module: "B",
    category: "Inheritance and Variation of Traits",
  },
  {
    id: "3.1.9-12.N",
    label:
      "Design, evaluate, and refine a solution for reducing the impacts of human activities on the environment and biodiversity.",
    module: "B",
    category: "Interdependent Relationships in Ecosystems",
  },
  {
    id: "3.1.9-12.O",
    label:
      "Evaluate the evidence for the role of group behavior on individual and species’ chances to survive and reproduce.",
    module: "B",
    category: "Interdependent Relationships in Ecosystems",
  },
  {
    id: "3.1.9-12.P",
    label:
      "Ask questions to clarify relationships about the role of DNA and chromosomes in coding the instructions for characteristic traits passed from parents to offsprings.",
    module: "B",
    category: "Inheritance and Variation of Traits",
  },
  {
    id: "3.1.9-12.Q",
    label:
      "Make and defend a claim based on evidence that inheritable genetic variations may result from (1) new genetic combinations through meiosis, (2) viable errors occurring during replication, and/or (3) mutations caused by environmental factors.",
    module: "B",
    category: "Inheritance and Variation of Traits",
  },
  {
    id: "3.1.9-12.R",
    label:
      "Apply concepts of statistics and probability to explain the variation and distribution of expressed traits in a population.",
    module: "B",
    category: "Inheritance and Variation of Traits",
  },
  {
    id: "3.1.9-12.S",
    label:
      "Communicate scientific information that common ancestry and biological evolution are supported by multiple lines of empirical evidence.",
    module: "B",
    category: "Natural Selection and Evolution",
  },
  {
    id: "3.1.9-12.T",
    label:
      "Construct an explanation based on evidence that the process of evolution primarily results from four factors: (1) the potential for a species to increase in number, (2) the heritable genetic variation of individuals in a species due to mutation and sexual reproduction, (3) competition for limited resources, and (4) the proliferation of those organisms that are better able to survive and reproduce in the environment.",
    module: "B",
    category: "Natural Selection and Evolution",
  },
  {
    id: "3.1.9-12.U",
    label:
      "Apply concepts of statistics and probability to support explanations that organisms with an advantageous heritable trait tend to increase in proportion to organisms lacking this trait.",
    module: "B",
    category: "Natural Selection and Evolution",
  },
  {
    id: "3.1.9-12.V",
    label:
      "Create or revise a simulation to test a solution to mitigate the adverse impacts of human activity on biodiversity.",
    module: "B",
    category: "Interdependent Relationships in Ecosystems",
  },
  {
    id: "3.1.9-12.W",
    label:
      "Construct an explanation based on evidence for how natural selection leads to adaptation of populations.",
    module: "B",
    category: "Natural Selection and Evolution",
  },
  {
    id: "3.1.9-12.X",
    label:
      "Evaluate the evidence supporting claims that changes in environmental conditions may result in (1) increases in the number of individuals of some species, (2) the emergence of new species over time, and (3) the extinction of other species.",
    module: "B",
    category: "Natural Selection and Evolution",
  },
];

const STANDARD_MAP = new Map(
  STANDARD_DEFINITIONS.map((item) => [item.id, item]),
);

// Legacy module-topic names used in the static question bank (questions.json)
// that don't match any standard category string.
const LEGACY_TOPIC_STANDARD_ID: Record<string, string> = {
  "Basic Biological Principles": "3.1.9-12.A",
  "Chemical Basis for Life": "3.1.9-12.F",
  "Bioenergetics": "3.1.9-12.E",
  "Homeostasis and Transport": "3.1.9-12.C",
  "Cell Growth and Reproduction": "3.1.9-12.D",
  "Genetics": "3.1.9-12.P",
  "Theory of Evolution": "3.1.9-12.S",
  "Ecology": "3.1.9-12.L",
};

const MODULE_CATEGORY_TOPIC_PATTERN =
  /^\s*(?:\[?\s*Module\s+([AB])\s*\]?\s*[-:]\s*)?(.+?)\s*$/i;

export function getAllStandards(): StandardInfo[] {
  return STANDARD_DEFINITIONS;
}

export function getStandardById(standardId: string): StandardInfo | undefined {
  return STANDARD_MAP.get(standardId);
}

export function getStandardsByFilter(filter?: {
  module?: ModuleCode;
  category?: string;
}): StandardInfo[] {
  return STANDARD_DEFINITIONS.filter((standard) => {
    if (filter?.module && standard.module !== filter.module) return false;
    if (filter?.category && standard.category !== filter.category) return false;
    return true;
  });
}

export function getStandardsForModule(module: ModuleCode): StandardInfo[] {
  return getStandardsByFilter({ module });
}

export function getStandardsForTopic(topic: string): StandardInfo[] {
  const match = topic.match(MODULE_CATEGORY_TOPIC_PATTERN);
  if (!match) return [];

  const module = match[1] as ModuleCode | undefined;
  const category = match[2]?.trim();
  if (!category) return [];

  return getStandardsByFilter({ module, category });
}

export function getDefaultStandardForTopic(topic: string): StandardInfo {
  const mapped = getStandardsForTopic(topic);
  if (mapped.length > 0) return mapped[0];
  const legacyId = LEGACY_TOPIC_STANDARD_ID[topic];
  if (legacyId) {
    const legacy = STANDARD_MAP.get(legacyId);
    if (legacy) return legacy;
  }
  return STANDARD_DEFINITIONS[0];
}

export function getStandardForTopic(topic: string): StandardInfo {
  return getDefaultStandardForTopic(topic);
}
