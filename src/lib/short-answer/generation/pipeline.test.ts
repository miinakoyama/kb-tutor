import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StimulusType } from "@/types/short-answer";

const retrieveStudyGuideForCoreKC = vi.fn();
vi.mock("./data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./data")>();
  return {
    ...actual,
    retrieveStudyGuideForCoreKC: (...args: unknown[]) =>
      retrieveStudyGuideForCoreKC(...args),
  };
});

const chatComplete = vi.fn();
vi.mock("@/lib/llm/client", () => ({
  chatComplete: (...args: unknown[]) => chatComplete(...args),
}));

const generateIllustrationImage = vi.fn();
vi.mock("@/lib/llm/images", () => ({
  generateIllustrationImage: (...args: unknown[]) => generateIllustrationImage(...args),
}));

const STANDARD = "3.1.9-12.A";
const ANCHOR = "3.1.9-12.A1";

function blueprintJSON(stimulusType: StimulusType) {
  return JSON.stringify({
    target_standard: STANDARD,
    anchor_kc: ANCHOR,
    core_kc: ANCHOR,
    selected_kcs: [ANCHOR],
    supporting_kcs: [],
    stem_affordance: "A shared DNA-to-protein context.",
    compatibility_rationale: "All parts probe the same central-dogma pathway.",
    cognitive_demand: "Moderate",
    key_concepts: ["DNA", "mRNA", "protein"],
    task_sequence: {
      "Part A": { kc_code: ANCHOR, task_type: "Recall / Identify / Classify", function: "identify the molecule that stores genetic information" },
      "Part B": { kc_code: ANCHOR, task_type: "Explain Mechanism", function: "explain how the base sequence encodes a protein" },
      "Part C": { kc_code: ANCHOR, task_type: "Prediction", function: "predict the effect of a base substitution" },
    },
    stimulus_type: stimulusType,
    evidence_pattern: "scenario with concrete observations",
    expected_response_elements: ["names DNA", "connects sequence to protein"],
    common_incomplete_responses: ["confuses DNA and RNA"],
  });
}

function stimulusAsset(stimulusType: StimulusType) {
  const base = { type: stimulusType, title: "DNA and Protein" };
  switch (stimulusType) {
    case "table":
      return { ...base, table_markdown: "| Codon | Amino acid |\n| --- | --- |\n| AUG | Met |" };
    case "line_graph":
    case "bar_chart":
      return {
        ...base,
        chart_data: {
          x_label: "Time",
          y_label: "Amount",
          series: [{ name: "Protein", points: [["0", 1], ["1", 3]] }],
        },
      };
    case "diagram":
      return {
        ...base,
        diagram_spec: "<svg width='540' height='320' xmlns='http://www.w3.org/2000/svg'><rect x='20' y='20' width='100' height='40'/></svg>",
      };
    case "illustration":
      return { ...base, illustration_prompt: "A black-and-white drawing of a ribosome." };
    case "scenario":
    default:
      return {
        ...base,
        scenario_text: "A researcher observes cells producing a specific protein after a gene is activated.",
      };
  }
}

function itemJSON(stimulusType: StimulusType) {
  return JSON.stringify({
    stem: "Cells build proteins using information stored in their DNA.",
    stimulus_asset: stimulusAsset(stimulusType),
    parts: {
      "Part A": { task_type: "Recall / Identify / Classify", question: "Which molecule stores the instructions for building a protein?" },
      "Part B": { task_type: "Explain Mechanism", question: "Explain how the order of bases determines the protein produced." },
      "Part C": { task_type: "Prediction", question: "Predict how changing one base could affect the protein." },
    },
    part_rubrics: {
      "Part A": { points_possible: 1, criteria: { "1": "Correctly names DNA.", "0": "Does not name DNA." } },
      "Part B": { points_possible: 1, criteria: { "1": "Links base order to amino-acid order.", "0": "No mechanism given." } },
      "Part C": { points_possible: 1, criteria: { "1": "Predicts a changed or nonfunctional protein.", "0": "No valid prediction." } },
    },
    annotated_responses: [
      { score: 3, response: "DNA stores it; base order sets amino-acid order; a change alters the protein.", annotation: "All three criteria met." },
      { score: 2, response: "DNA stores it and base order sets the protein.", annotation: "Missing the prediction." },
      { score: 1, response: "DNA stores the instructions.", annotation: "Only Part A." },
      { score: 0, response: "The cell just makes it.", annotation: "No correct biology." },
    ],
  });
}

function mockRun(stimulusType: StimulusType) {
  chatComplete
    .mockResolvedValueOnce({ content: blueprintJSON(stimulusType), tokenCount: 100 })
    .mockResolvedValueOnce({ content: itemJSON(stimulusType), tokenCount: 200 });
}

async function load() {
  return import("./pipeline");
}

describe("generateShortAnswerItem", () => {
  beforeEach(() => {
    vi.resetModules();
    chatComplete.mockReset();
    generateIllustrationImage.mockReset();
    retrieveStudyGuideForCoreKC.mockResolvedValue([
      { chunkId: "sg-1", text: "DNA stores genetic information.", score: 0.82 },
      { chunkId: "sg-2", text: "Proteins are built from amino acids.", score: 0.71 },
    ]);
  });
  afterEach(() => vi.clearAllMocks());

  it("produces a valid item with C3 study-guide grounding metadata", async () => {
    mockRun("scenario");
    const { generateShortAnswerItem } = await load();
    const out = await generateShortAnswerItem({
      standardCode: STANDARD,
      fixedCoreKC: ANCHOR,
      stimulusType: "scenario",
      modelId: "gpt-5.4",
      temperature: 1,
    });
    expect(chatComplete).toHaveBeenCalledTimes(2);
    expect(retrieveStudyGuideForCoreKC).toHaveBeenCalledTimes(1);
    expect(out.item.stimulus.type).toBe("scenario");
    expect(out.item.parts).toHaveLength(3);
    expect(out.item.parts[0].rubric.criteria["1"]).toContain("DNA");
    expect(out.item.scoringRubric).toBeUndefined();
    expect(out.metadata.method).toBe("method2_blueprint_rag_l2");
    expect(out.metadata.useStudyGuideRag).toBe(true);
    expect(out.metadata.telerLevel).toBe(2);
    expect(out.grounding.studyGuide.empty).toBe(false);
    expect(out.grounding.studyGuide.chunkIds).toEqual(["sg-1", "sg-2"]);
  });

  it("propagates the requested stimulus type through both stages", async () => {
    mockRun("table");
    const { generateShortAnswerItem } = await load();
    const out = await generateShortAnswerItem({
      standardCode: STANDARD,
      fixedCoreKC: ANCHOR,
      stimulusType: "table",
      modelId: "gpt-5.4",
      temperature: 1,
    });
    expect(out.blueprint.stimulusType).toBe("table");
    expect(out.item.stimulus.type).toBe("table");
  });

  it("auto-selects a valid KC and stimulus when none provided", async () => {
    // Force randomPick to index 0: KC = A1, stimulus = STIMULUS_TYPES[0] = "table".
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    mockRun("table");
    const { generateShortAnswerItem } = await load();
    const out = await generateShortAnswerItem({
      standardCode: STANDARD,
      modelId: "gpt-5.4",
      temperature: 1,
    });
    expect(out.blueprint.anchorKc).toBe(ANCHOR);
    expect(out.item.stimulus.type).toBe("table");
    randomSpy.mockRestore();
  });

  it("retries on an invalid blueprint then succeeds", async () => {
    chatComplete
      .mockResolvedValueOnce({ content: JSON.stringify({ target_standard: STANDARD }), tokenCount: 1 })
      .mockResolvedValueOnce({ content: blueprintJSON("scenario"), tokenCount: 100 })
      .mockResolvedValueOnce({ content: itemJSON("scenario"), tokenCount: 200 });
    const { generateShortAnswerItem } = await load();
    const out = await generateShortAnswerItem({
      standardCode: STANDARD,
      fixedCoreKC: ANCHOR,
      stimulusType: "scenario",
      modelId: "gpt-5.4",
      temperature: 1,
    });
    expect(chatComplete).toHaveBeenCalledTimes(3);
    expect(out.item.stem).toContain("proteins");
  });

  it("throws a retriable blueprint error after exhausting the retry budget", async () => {
    chatComplete.mockResolvedValue({ content: JSON.stringify({ nope: true }), tokenCount: 0 });
    const { generateShortAnswerItem, GenerationError } = await load();
    await expect(
      generateShortAnswerItem({
        standardCode: STANDARD,
        fixedCoreKC: ANCHOR,
        stimulusType: "scenario",
        modelId: "gpt-5.4",
        temperature: 1,
      }),
    ).rejects.toMatchObject({ stage: "blueprint", retriable: true });
    expect(chatComplete).toHaveBeenCalledTimes(3);
    expect(GenerationError).toBeDefined();
  });

  it("rejects an unknown standard without calling the model", async () => {
    const { generateShortAnswerItem } = await load();
    await expect(
      generateShortAnswerItem({
        standardCode: "9.9.9-99.Z",
        modelId: "gpt-5.4",
        temperature: 1,
      }),
    ).rejects.toThrow(/No KCs found/);
    expect(chatComplete).not.toHaveBeenCalled();
  });

  it("rejects an unknown generation model", async () => {
    const { generateShortAnswerItem } = await load();
    await expect(
      generateShortAnswerItem({
        standardCode: STANDARD,
        modelId: "not-a-model",
        temperature: 1,
      }),
    ).rejects.toThrow(/Unknown generation model/);
  });

  it("generates an illustration image and attaches imageB64 to the stimulus", async () => {
    mockRun("illustration");
    generateIllustrationImage.mockResolvedValue({
      imageB64: "ZmFrZS1pbWFnZQ==",
      modelId: "gpt-image-2",
    });
    const { generateShortAnswerItem } = await load();
    const out = await generateShortAnswerItem({
      standardCode: STANDARD,
      fixedCoreKC: ANCHOR,
      stimulusType: "illustration",
      modelId: "gpt-5.4",
      temperature: 1,
    });
    expect(chatComplete).toHaveBeenCalledTimes(2);
    expect(generateIllustrationImage).toHaveBeenCalledTimes(1);
    expect(out.item.stimulus.type).toBe("illustration");
    if (out.item.stimulus.type === "illustration") {
      expect(out.item.stimulus.imageB64).toBe("ZmFrZS1pbWFnZQ==");
    }
  });

  it("retries illustration image generation then succeeds", async () => {
    mockRun("illustration");
    generateIllustrationImage
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({ imageB64: "retry-ok", modelId: "gpt-image-2" });
    const { generateShortAnswerItem } = await load();
    const out = await generateShortAnswerItem({
      standardCode: STANDARD,
      fixedCoreKC: ANCHOR,
      stimulusType: "illustration",
      modelId: "gpt-5.4",
      temperature: 1,
    });
    expect(generateIllustrationImage).toHaveBeenCalledTimes(2);
    if (out.item.stimulus.type === "illustration") {
      expect(out.item.stimulus.imageB64).toBe("retry-ok");
    }
  });

  it("throws a retriable illustration error after exhausting image retries", async () => {
    mockRun("illustration");
    generateIllustrationImage.mockRejectedValue(new Error("upstream failure"));
    const { generateShortAnswerItem, GenerationError } = await load();
    await expect(
      generateShortAnswerItem({
        standardCode: STANDARD,
        fixedCoreKC: ANCHOR,
        stimulusType: "illustration",
        modelId: "gpt-5.4",
        temperature: 1,
      }),
    ).rejects.toMatchObject({ stage: "illustration", retriable: true });
    expect(generateIllustrationImage).toHaveBeenCalledTimes(3);
    expect(GenerationError).toBeDefined();
  });
});
