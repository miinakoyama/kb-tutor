import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openAiCreate = vi.fn();
const anthropicCreate = vi.fn();

vi.mock("openai", () => {
  class MockOpenAI {
    chat = { completions: { create: openAiCreate } };
  }
  return { default: MockOpenAI };
});

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: anthropicCreate };
  }
  return { default: MockAnthropic };
});

async function loadClient() {
  return import("@/lib/llm/client");
}

describe("chatComplete provider routing", () => {
  beforeEach(() => {
    vi.resetModules();
    openAiCreate.mockReset();
    anthropicCreate.mockReset();
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.GEMINI_API_KEY = "test-gemini";
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it("routes claude- models to Anthropic and strips JSON fences in jsonMode", async () => {
    anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "```json\n{\"score\":3}\n```" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const { chatComplete } = await loadClient();
    const result = await chatComplete({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "u" },
      ],
      jsonMode: true,
    });
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(openAiCreate).not.toHaveBeenCalled();
    expect(result.content).toBe('{"score":3}');
    expect(result.tokenCount).toBe(15);
  });

  it("adds a JSON instruction to the Anthropic system prompt in jsonMode", async () => {
    anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "{}" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const { chatComplete } = await loadClient();
    await chatComplete({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "hi" }],
      jsonMode: true,
    });
    const arg = anthropicCreate.mock.calls[0][0];
    expect(arg.system).toMatch(/ONLY valid JSON/);
    // system message is not passed through as a chat message
    expect(arg.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("routes gemini- models through the OpenAI-compatible client with json_object", async () => {
    openAiCreate.mockResolvedValue({
      choices: [{ message: { content: "{}" } }],
      usage: { total_tokens: 7 },
    });
    const { chatComplete } = await loadClient();
    const result = await chatComplete({
      model: "gemini-3.1-flash-lite-preview",
      messages: [{ role: "user", content: "u" }],
      jsonMode: true,
    });
    expect(openAiCreate).toHaveBeenCalledTimes(1);
    const arg = openAiCreate.mock.calls[0][0];
    expect(arg.response_format).toEqual({ type: "json_object" });
    expect(result.tokenCount).toBe(7);
  });

  it("routes other models to OpenAI", async () => {
    openAiCreate.mockResolvedValue({
      choices: [{ message: { content: "hello" } }],
      usage: { total_tokens: 3 },
    });
    const { chatComplete } = await loadClient();
    const result = await chatComplete({
      model: "gpt-5.4",
      messages: [{ role: "user", content: "u" }],
    });
    expect(openAiCreate).toHaveBeenCalledTimes(1);
    const arg = openAiCreate.mock.calls[0][0];
    expect(arg.response_format).toBeUndefined();
    expect(result.content).toBe("hello");
  });

  it("propagates an abort signal to the provider call", async () => {
    openAiCreate.mockImplementation((_body, opts) => {
      expect(opts?.signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve({
        choices: [{ message: { content: "ok" } }],
        usage: { total_tokens: 1 },
      });
    });
    const { chatComplete } = await loadClient();
    await chatComplete({
      model: "gpt-5.4",
      messages: [{ role: "user", content: "u" }],
    });
    expect(openAiCreate).toHaveBeenCalled();
  });
});

describe("provider inference", () => {
  it("maps model prefixes to providers", async () => {
    const { getProvider } = await loadClient();
    expect(getProvider("claude-opus-4-8")).toBe("anthropic");
    expect(getProvider("gemini-3.1-flash-lite-preview")).toBe("google");
    expect(getProvider("gpt-5.4")).toBe("openai");
  });
});
