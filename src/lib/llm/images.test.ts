import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const imagesGenerate = vi.fn();

vi.mock("openai", () => {
  class MockOpenAI {
    images = { generate: imagesGenerate };
  }
  return { default: MockOpenAI };
});

async function loadImages() {
  return import("@/lib/llm/images");
}

describe("generateIllustrationImage", () => {
  beforeEach(() => {
    vi.resetModules();
    imagesGenerate.mockReset();
    process.env.OPENAI_API_KEY = "test-openai";
    delete process.env.ILLUSTRATION_IMAGE_MODEL;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls OpenAI images.generate with b64_json and returns base64 payload", async () => {
    imagesGenerate.mockResolvedValue({
      data: [{ b64_json: "abc123" }],
    });
    const { generateIllustrationImage } = await loadImages();
    const result = await generateIllustrationImage({
      prompt: "A ribosome translating mRNA.",
    });
    expect(result.imageB64).toBe("abc123");
    expect(result.modelId).toBe("gpt-image-2");
    expect(imagesGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2",
        prompt: expect.stringContaining("Black and white worksheet-style"),
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(imagesGenerate.mock.calls[0][0]).not.toHaveProperty("response_format");
    expect(imagesGenerate.mock.calls[0][0].prompt).toContain("A ribosome translating mRNA.");
  });

  it("uses ILLUSTRATION_IMAGE_MODEL when set", async () => {
    process.env.ILLUSTRATION_IMAGE_MODEL = "gpt-image-2-2026-04-21";
    imagesGenerate.mockResolvedValue({
      data: [{ b64_json: "snap" }],
    });
    const { generateIllustrationImage, getIllustrationImageModelId } = await loadImages();
    expect(getIllustrationImageModelId()).toBe("gpt-image-2-2026-04-21");
    const result = await generateIllustrationImage({ prompt: "Cell membrane." });
    expect(result.modelId).toBe("gpt-image-2-2026-04-21");
    expect(imagesGenerate.mock.calls[0][0].model).toBe("gpt-image-2-2026-04-21");
  });

  it("throws when the API returns no image data", async () => {
    imagesGenerate.mockResolvedValue({ data: [] });
    const { generateIllustrationImage } = await loadImages();
    await expect(generateIllustrationImage({ prompt: "DNA helix." })).rejects.toThrow(
      /no b64_json/,
    );
  });
});
