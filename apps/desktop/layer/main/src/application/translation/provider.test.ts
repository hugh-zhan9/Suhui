import { describe, expect, it, vi } from "vitest"

import { translateWithDeepL, translateWithOpenAICompatible } from "./provider"

describe("translation providers", () => {
  it("uses the official DeepL JSON contract without exposing the key in the URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ translations: [{ text: "你好" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    await expect(
      translateWithDeepL(
        {
          provider: "deepl",
          baseUrl: "https://api-free.deepl.com/",
          apiKey: "secret-key",
        },
        ["Hello"],
        "zh-CN",
        fetchImpl,
      ),
    ).resolves.toEqual(["你好"])

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api-free.deepl.com/v2/translate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "DeepL-Auth-Key secret-key" }),
      }),
    )
    const request = fetchImpl.mock.calls[0]![1] as RequestInit
    expect(JSON.parse(request.body as string)).toMatchObject({
      text: ["Hello"],
      target_lang: "ZH-HANS",
    })
    expect(JSON.parse(request.body as string)).not.toHaveProperty("tag_handling")
    expect(fetchImpl.mock.calls[0]![0]).not.toContain("secret-key")
  })

  it("uses an OpenAI-compatible chat completion and accepts fenced JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '```json\n{"translations":["你好"]}\n```' } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )

    await expect(
      translateWithOpenAICompatible(
        {
          provider: "openai-compatible",
          baseUrl: "https://ai.example.com/v1",
          apiKey: "ai-secret",
          model: "example-model",
          apiProtocol: "chat-completions",
        },
        ["Hello"],
        "zh-CN",
        fetchImpl,
      ),
    ).resolves.toEqual(["你好"])

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://ai.example.com/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer ai-secret" }),
      }),
    )
    const request = fetchImpl.mock.calls[0]![1] as RequestInit
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: "example-model",
      temperature: 0,
    })
  })

  it("uses the Responses API without falling back to chat completions", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: '{"translations":["你好"]}' }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )

    await expect(
      translateWithOpenAICompatible(
        {
          provider: "openai-compatible",
          baseUrl: "https://ai.example.com/v1",
          apiKey: "ai-secret",
          model: "grok-4.6",
          apiProtocol: "responses",
        },
        ["Hello"],
        "zh-CN",
        fetchImpl,
      ),
    ).resolves.toEqual(["你好"])

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0]![0]).toBe("https://ai.example.com/v1/responses")
    const request = fetchImpl.mock.calls[0]![1] as RequestInit
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: "grok-4.6",
      instructions: expect.any(String),
      input: expect.any(String),
    })
  })

  it("shows a bounded provider reason without exposing credentials", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "model_not_found",
            message: `unknown provider for model; leaked ai-secret sk-${"x".repeat(40)} ${"z".repeat(700)}`,
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    )

    await expect(
      translateWithOpenAICompatible(
        {
          provider: "openai-compatible",
          baseUrl: "https://ai.example.com/v1",
          apiKey: "ai-secret",
          model: "grok-4.6",
          apiProtocol: "chat-completions",
        },
        ["Hello"],
        "zh-CN",
        fetchImpl,
      ),
    ).rejects.toSatisfy((error: Error) => {
      expect(error.message).toContain("HTTP 400")
      expect(error.message).toContain("model_not_found")
      expect(error.message).toContain("unknown provider for model")
      expect(error.message).not.toContain("ai-secret")
      expect(error.message).not.toContain("sk-")
      expect(error.message.length).toBeLessThanOrEqual(560)
      return true
    })
  })
})
