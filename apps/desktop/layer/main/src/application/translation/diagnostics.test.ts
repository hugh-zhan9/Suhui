import { beforeEach, describe, expect, it, vi } from "vitest"

import { logger } from "~/logger"

import { createTranslationTrace, logTranslation } from "./diagnostics"
import { translateTexts } from "./provider"

vi.mock("~/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }))

const config = {
  provider: "openai-compatible" as const,
  baseUrl: "https://private.example/v1?key=private-api-key",
  apiKey: "private-api-key",
  model: "private-model",
}
const records = () =>
  [...vi.mocked(logger.info).mock.calls, ...vi.mocked(logger.warn).mock.calls].map((call) =>
    JSON.parse(String(call[1])),
  )

describe("translation diagnostics", () => {
  beforeEach(() => vi.clearAllMocks())

  it("records lifecycle, protocol, lengths, HTTP status and elapsed time without storing content or credentials", async () => {
    const trace = {
      ...createTranslationTrace("article", "private-entry"),
      target: "content" as const,
      batchIndex: 2,
      totalBatches: 5,
    }
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "private-result" } }],
        }),
      ),
    )
    await expect(
      translateTexts(config, ["private-original"], "zh-CN", fetchImpl, trace),
    ).resolves.toEqual(["private-result"])
    expect(records().map((event) => event.event)).toEqual([
      "request.started",
      "request.headers",
      "request.completed",
    ])
    expect(records()[2]).toMatchObject({
      traceId: trace.traceId,
      target: "content",
      batchIndex: 2,
      totalBatches: 5,
      characters: 16,
      textCount: 1,
      outputFormat: "text",
      httpStatus: 200,
      timeoutMs: 120_000,
      elapsedMs: expect.any(Number),
      protocol: "chat-completions",
    })
    const output = JSON.stringify(records())
    for (const secret of [
      "private-api-key",
      "private-model",
      "private-original",
      "private-result",
      "private-entry",
      "private.example",
    ])
      expect(output).not.toContain(secret)
  })

  it.each([false, true])(
    "identifies timeout before/after response headers (headers received: %s)",
    async (headersReceived) => {
      const trace = {
        ...createTranslationTrace("article"),
        target: "description" as const,
        batchIndex: 1,
        totalBatches: 3,
      }
      const error = new DOMException("secret-provider-body", "TimeoutError")
      const response = new Response("{}")
      vi.spyOn(response, "json").mockRejectedValue(error)
      const fetchImpl = headersReceived
        ? vi.fn().mockResolvedValue(response)
        : vi.fn().mockRejectedValue(error)
      await expect(translateTexts(config, ["Hello"], "zh-CN", fetchImpl, trace)).rejects.toThrow(
        `摘要翻译超时（120 秒，第 1/3 批，5 字符；${headersReceived ? "读取响应结果时超时" : "尚未收到响应头"}）。诊断 ID：${trace.traceId}`,
      )
      expect(records().at(-1)).toMatchObject({
        event: "request.failed",
        errorKind: "timeout",
        phase: headersReceived ? "reading_response" : "waiting_response",
        traceId: trace.traceId,
      })
      expect(JSON.stringify(records())).not.toContain("secret-provider-body")
      expect(fetchImpl).toHaveBeenCalledOnce()
    },
  )

  it("records HTTP failures without logging the provider's body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "private-api-key secret-provider-message" } }),
          { status: 429 },
        ),
      )
    await expect(translateTexts(config, ["Hello"], "zh-CN", fetchImpl)).rejects.toThrow("HTTP 429")
    expect(records().at(-1)).toMatchObject({ event: "request.failed", httpStatus: 429 })
    expect(JSON.stringify(records())).not.toMatch(/private-api-key|secret-provider-message/)
  })

  it.each([
    [{ translations: ["private-result"] }, "count_mismatch", 1, "预期 3 条，实际 1 条"],
    [{ translations: { text: "private-result" } }, "invalid_shape", undefined, "格式无效"],
    [{ translations: ["private-result", null, "last"] }, "invalid_item", 3, "类型无效"],
  ] as const)(
    "records validation counts and category without exposing response text: %j",
    async (result, validationIssue, receivedCount, message) => {
      const trace = {
        ...createTranslationTrace("article"),
        target: "content" as const,
        batchIndex: 3,
        totalBatches: 178,
      }
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(result) })))
      await expect(
        translateTexts(
          { ...config, apiProtocol: "responses" },
          ["private-original", "link", "."],
          "zh-CN",
          fetchImpl,
          trace,
        ),
      ).rejects.toThrow(message)
      expect(records().at(-1)).toMatchObject({
        traceId: trace.traceId,
        target: "content",
        batchIndex: 3,
        totalBatches: 178,
        event: "request.failed",
        httpStatus: 200,
        phase: "reading_response",
        errorKind: "invalid_translation",
        validationIssue,
        outputFormat: "json_array",
        expectedCount: 3,
        ...(receivedCount === undefined ? {} : { receivedCount }),
      })
      expect(JSON.stringify(records())).not.toMatch(
        /private-original|private-result|private-api-key/,
      )
      expect(fetchImpl).toHaveBeenCalledOnce()
    },
  )

  it.each(["response_body", "translation_json"] as const)(
    "reports invalid JSON at %s without exposing text or silently repairing it",
    async (parseStage) => {
      const content = '{"translations":["private-result }'
      const response =
        parseStage === "response_body"
          ? new Response('{"private-api-key": "unfinished')
          : new Response(JSON.stringify({ status: "completed", output_text: content }))
      const fetchImpl = vi.fn().mockResolvedValue(response)
      await expect(
        translateTexts(
          { ...config, apiProtocol: "responses" },
          ["private-original", "second"],
          "zh-CN",
          fetchImpl,
        ),
      ).rejects.toMatchObject({
        name: "SyntaxError",
        parseStage,
        message:
          parseStage === "response_body"
            ? "在线 AI 的 HTTP 响应不是完整有效的 JSON"
            : "在线 AI 生成的译文不是完整有效的 JSON",
      })
      expect(records().at(-1)).toMatchObject({
        event: "request.failed",
        errorKind: "invalid_json",
        parseStage,
        ...(parseStage === "translation_json"
          ? { outputCharacters: content.length, completionState: "complete" }
          : {}),
      })
      expect(JSON.stringify(records())).not.toMatch(
        /private-result|private-api-key|private-original/,
      )
      expect(fetchImpl).toHaveBeenCalledOnce()
    },
  )

  it("does not turn a logging transport failure into a translation failure", async () => {
    vi.mocked(logger.info).mockImplementationOnce(() => {
      throw new Error("disk full")
    })
    expect(() =>
      logTranslation(createTranslationTrace("config-test"), "request.started"),
    ).not.toThrow()
  })
})
