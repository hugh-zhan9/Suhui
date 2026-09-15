import { describe, expect, it, vi } from "vitest"

import { translateWithDeepL, translateWithOpenAICompatible } from "./provider"

vi.mock("~/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }))

describe("translation providers", () => {
  it.each(["chat-completions", "responses"] as const)(
    "translates a single item as literal text with %s instead of requiring model-generated JSON",
    async (apiProtocol) => {
      const text = 'A declaration about "Mathematics and AI". A path: C:\\notes.'
      const translation = '一份关于"数学与 AI"的声明。\n路径：C:\\notes。引用：```示例```'
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(
            apiProtocol === "responses"
              ? {
                  status: "completed",
                  output: [{ content: [{ type: "output_text", text: translation }] }],
                }
              : { choices: [{ finish_reason: "stop", message: { content: translation } }] },
          ),
        ),
      )
      await expect(
        translateWithOpenAICompatible(
          {
            provider: "openai-compatible",
            baseUrl: "https://ai.example/v1",
            apiKey: "secret",
            model: "model",
            apiProtocol,
          },
          [text],
          "zh-CN",
          fetchImpl,
        ),
      ).resolves.toEqual([translation])
      const body = JSON.parse(fetchImpl.mock.calls[0]![1].body)
      expect(body.instructions ?? body.messages[0].content).toContain(
        "Return only the translated text",
      )
      expect(JSON.parse(body.input ?? body.messages[1].content)).toEqual({
        targetLanguage: "ZH-HANS",
        text,
      })
      expect(fetchImpl).toHaveBeenCalledOnce()
    },
  )

  it("keeps literal JSON-looking source text as text without unwrapping or repairing it", async () => {
    const text = '{"translations":["an example"]}'
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: text })))
    await expect(
      translateWithOpenAICompatible(
        {
          provider: "openai-compatible",
          baseUrl: "https://ai.example/v1",
          apiKey: "secret",
          model: "model",
          apiProtocol: "responses",
        },
        [text],
        "en",
        fetchImpl,
      ),
    ).resolves.toEqual([text])
  })

  it.each(["chat-completions", "responses"] as const)(
    "rejects unfinished output from %s even when it looks usable",
    async (apiProtocol) => {
      for (const texts of [["first"], ["first", "second"]]) {
        const content =
          texts.length === 1 ? "部分译文" : JSON.stringify({ translations: ["第一", "第二"] })
        const fetchImpl = vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify(
                apiProtocol === "responses"
                  ? { status: "incomplete", output_text: content }
                  : { choices: [{ finish_reason: "length", message: { content } }] },
              ),
            ),
          )
        await expect(
          translateWithOpenAICompatible(
            {
              provider: "openai-compatible",
              baseUrl: "https://ai.example/v1",
              apiKey: "secret",
              model: "model",
              apiProtocol,
            },
            texts,
            "zh-CN",
            fetchImpl,
          ),
        ).rejects.toMatchObject({ validationIssue: "incomplete_output" })
        expect(fetchImpl).toHaveBeenCalledOnce()
      }
    },
  )

  it.each([
    {
      apiProtocol: "responses" as const,
      response: {
        status: "completed",
        output: [{ content: [{ type: "refusal", refusal: "private-reason" }] }],
      },
    },
    {
      apiProtocol: "chat-completions" as const,
      response: {
        choices: [{ message: { content: "private-reason", refusal: "private-reason" } }],
      },
    },
    {
      apiProtocol: "chat-completions" as const,
      response: { choices: [{ finish_reason: "content_filter", message: { content: "partial" } }] },
    },
  ])(
    "does not accept a provider refusal as a single-item translation: $apiProtocol",
    async ({ apiProtocol, response }) => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(response)))
      await expect(
        translateWithOpenAICompatible(
          {
            provider: "openai-compatible",
            baseUrl: "https://ai.example/v1",
            apiKey: "secret",
            model: "model",
            apiProtocol,
          },
          ["Hello"],
          "zh-CN",
          fetchImpl,
        ),
      ).rejects.toMatchObject({
        validationIssue: "refused_output",
        message: "在线 AI 拒绝生成译文",
      })
      expect(fetchImpl).toHaveBeenCalledOnce()
    },
  )

  it("does not call the provider for an empty batch", async () => {
    const fetchImpl = vi.fn()
    await expect(
      translateWithOpenAICompatible(
        { provider: "openai-compatible", baseUrl: "https://ai.example/v1", apiKey: "secret" },
        [],
        "zh-CN",
        fetchImpl,
      ),
    ).resolves.toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each(["failed", "cancelled", "in_progress", "queued"])(
    "rejects an explicitly non-successful Responses result: %s",
    async (status) => {
      for (const texts of [["first"], ["first", "second"]]) {
        const output_text =
          texts.length === 1 ? "部分译文" : JSON.stringify({ translations: ["第一", "第二"] })
        const fetchImpl = vi
          .fn()
          .mockResolvedValue(new Response(JSON.stringify({ status, output_text })))
        await expect(
          translateWithOpenAICompatible(
            {
              provider: "openai-compatible",
              baseUrl: "https://ai.example/v1",
              apiKey: "secret",
              model: "model",
              apiProtocol: "responses",
            },
            texts,
            "zh-CN",
            fetchImpl,
          ),
        ).rejects.toMatchObject({
          validationIssue: ["failed", "cancelled"].includes(status)
            ? "failed_output"
            : "incomplete_output",
        })
        expect(fetchImpl).toHaveBeenCalledOnce()
      }
    },
  )

  it.each(["", "  "])("rejects an empty single-item translation: %j", async (content) => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ output_text: content })))
    await expect(
      translateWithOpenAICompatible(
        {
          provider: "openai-compatible",
          baseUrl: "https://ai.example/v1",
          apiKey: "secret",
          model: "model",
          apiProtocol: "responses",
        },
        ["Hello"],
        "zh-CN",
        fetchImpl,
      ),
    ).rejects.toMatchObject({ validationIssue: "empty_output" })
  })

  it.each(["chat-completions", "responses"] as const)(
    "preserves literal code fences, braces and escaped quotes inside valid %s JSON",
    async (apiProtocol) => {
      const translations = ['示例 ```json\n{"text":"引号"}\n``` 结束', '括号 } 和 "引用"']
      for (const fenced of [false, true]) {
        const json = JSON.stringify({ translations })
        const content = fenced ? `\`\`\`json\n${json}\n\`\`\`` : json
        const fetchImpl = vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify(
                apiProtocol === "responses"
                  ? { output_text: content }
                  : { choices: [{ message: { content } }] },
              ),
            ),
          )
        await expect(
          translateWithOpenAICompatible(
            {
              provider: "openai-compatible",
              baseUrl: "https://ai.example/v1",
              apiKey: "secret",
              model: "model",
              apiProtocol,
            },
            ["first", "second"],
            "zh-CN",
            fetchImpl,
          ),
        ).resolves.toEqual(translations)
        expect(fetchImpl).toHaveBeenCalledOnce()
      }
    },
  )

  it.each(["chat-completions", "responses"] as const)(
    "preserves separate inline fragments and punctuation with %s",
    async (apiProtocol) => {
      const translations = ["阅读", "这篇文章", "。"]
      const content = JSON.stringify({ translations })
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify(
              apiProtocol === "responses"
                ? { output_text: content }
                : { choices: [{ message: { content } }] },
            ),
          ),
        )
      const texts = ["Read", "this article", "."]
      await expect(
        translateWithOpenAICompatible(
          {
            provider: "openai-compatible",
            baseUrl: "https://ai.example.com/v1",
            apiKey: "secret",
            model: "model",
            apiProtocol,
          },
          texts,
          "zh-CN",
          fetchImpl,
        ),
      ).resolves.toEqual(translations)
      const request = JSON.parse(fetchImpl.mock.calls[0]![1].body)
      const instructions = request.instructions ?? request.messages[0].content
      expect(instructions).toContain("exactly 3 strings")
      expect(instructions).toContain("never merge, split, reorder or omit")
      expect(JSON.parse(request.input ?? request.messages[1].content).texts).toEqual(texts)
      expect(fetchImpl).toHaveBeenCalledOnce()
    },
  )

  it.each([
    [null, "invalid_shape", undefined],
    [{}, "invalid_shape", undefined],
    [{ translations: "merged" }, "invalid_shape", undefined],
    [{ translations: [] }, "count_mismatch", 0],
    [{ translations: ["merged"] }, "count_mismatch", 1],
    [{ translations: ["a", "b", "c", "d"] }, "count_mismatch", 4],
    [{ translations: ["a", null, "c"] }, "invalid_item", 3],
    [{ translations: [{ text: "a" }, "b", "c"] }, "invalid_item", 3],
  ] as const)(
    "rejects malformed translation results without guessing slot mappings: %j",
    async (result, validationIssue, receivedCount) => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(result) })))
      await expect(
        translateWithOpenAICompatible(
          {
            provider: "openai-compatible",
            baseUrl: "https://ai.example.com/v1",
            apiKey: "secret",
            model: "model",
            apiProtocol: "responses",
          },
          ["first", "linked", "last"],
          "zh-CN",
          fetchImpl,
        ),
      ).rejects.toMatchObject({
        name: "TranslationResponseError",
        validationIssue,
        expectedCount: 3,
        receivedCount,
      })
      expect(fetchImpl).toHaveBeenCalledOnce()
    },
  )

  it.each(["chat-completions", "responses"] as const)(
    "allows 120 seconds per %s request and still aborts without retrying",
    async (apiProtocol) => {
      vi.useFakeTimers()
      const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
        const controller = new AbortController()
        setTimeout(
          () => controller.abort(new DOMException("timed out", "TimeoutError")),
          milliseconds,
        )
        return controller.signal
      })
      let signal!: AbortSignal
      const fetchImpl = vi.fn(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            signal = init!.signal!
            signal.addEventListener("abort", () => reject(signal.reason), { once: true })
          }),
      )
      try {
        const job = translateWithOpenAICompatible(
          {
            provider: "openai-compatible",
            baseUrl: "https://ai.example.com/v1",
            apiKey: "secret",
            model: "model",
            apiProtocol,
          },
          ["Hello"],
          "zh-CN",
          fetchImpl,
        )
        const rejected = expect(job).rejects.toMatchObject({ name: "TimeoutError" })
        await vi.advanceTimersByTimeAsync(90_000)
        expect(signal.aborted).toBe(false)
        await vi.advanceTimersByTimeAsync(30_000)
        await rejected
        expect(signal.aborted).toBe(true)
        expect(fetchImpl).toHaveBeenCalledOnce()
      } finally {
        timeout.mockRestore()
        vi.useRealTimers()
      }
    },
  )

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

  it("uses an OpenAI-compatible chat completion and accepts fenced multi-item JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '```json\n{"translations":["你好","世界"]}\n```' } }],
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
        ["Hello", "World"],
        "zh-CN",
        fetchImpl,
      ),
    ).resolves.toEqual(["你好", "世界"])

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
              content: [{ type: "output_text", text: "你好" }],
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
