import { createHash } from "node:crypto"

import { safeStorage, session } from "electron"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { logger } from "~/logger"

vi.mock("~/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }))

const {
  stored,
  purgeAllForMaintenance,
  getTranslation,
  getBatches,
  saveBatch,
  clearBatches,
  replaceTranslation,
  getEntryMany,
  translationSessionFetch,
  translationSessionSetProxy,
} = vi.hoisted(() => ({
  stored: new Map<string, unknown>(),
  purgeAllForMaintenance: vi.fn(),
  getTranslation: vi.fn(),
  getBatches: vi.fn(),
  saveBatch: vi.fn(),
  clearBatches: vi.fn(),
  replaceTranslation: vi.fn(),
  getEntryMany: vi.fn(),
  translationSessionFetch: vi.fn(),
  translationSessionSetProxy: vi.fn(),
}))

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
    decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/, ""),
  },
  session: {
    fromPartition: vi.fn(() => ({
      fetch: translationSessionFetch,
      setProxy: translationSessionSetProxy,
    })),
  },
}))
vi.mock("~/lib/store", () => ({
  store: {
    get: (key: string) => stored.get(key),
    set: (key: string, value: unknown) => stored.set(key, value),
  },
}))
vi.mock("@suhui/database/services/translation", () => ({
  TranslationService: {
    getTranslation,
    getBatches,
    saveBatch,
    clearBatches,
    insertTranslation: vi.fn(),
    replaceTranslation,
    purgeAllForMaintenance,
  },
}))
vi.mock("@suhui/database/services/entry", () => ({
  EntryService: { getEntryMany },
}))

import { EntryTranslationApplicationService, entryTranslationApplicationService } from "./service"

describe("translation provider configuration", () => {
  beforeEach(() => {
    vi.mocked(logger.info).mockClear()
    vi.mocked(logger.warn).mockClear()
    stored.clear()
    purgeAllForMaintenance.mockReset().mockResolvedValue(undefined)
    getBatches.mockReset().mockResolvedValue([])
    saveBatch.mockReset().mockImplementation(async () => {})
    clearBatches.mockReset().mockImplementation(async () => {})
    getTranslation.mockReset().mockResolvedValue(undefined)
    replaceTranslation.mockReset().mockResolvedValue(undefined)
    getEntryMany.mockReset()
    translationSessionFetch.mockReset()
    translationSessionSetProxy.mockReset().mockResolvedValue(undefined)
    vi.mocked(session.fromPartition).mockClear()
    vi.unstubAllGlobals()
  })

  it("encrypts API keys and never returns them to the renderer", async () => {
    const view = await entryTranslationApplicationService.setConfig({
      provider: "openai-compatible",
      deepl: { baseUrl: "https://api-free.deepl.com", apiKey: "deepl-secret" },
      openAICompatible: {
        baseUrl: "https://ai.example.com/v1/",
        apiKey: "ai-secret",
        model: "translation-model",
      },
    })

    expect(view).toEqual({
      provider: "openai-compatible",
      deepl: { baseUrl: "https://api-free.deepl.com", hasApiKey: true },
      openAICompatible: {
        baseUrl: "https://ai.example.com/v1",
        hasApiKey: true,
        model: "translation-model",
        apiProtocol: "chat-completions",
      },
    })
    const persisted = stored.get("translationProviderConfig") as any
    expect(persisted.deepl.encryptedApiKey).not.toContain("deepl-secret")
    expect(persisted.openAICompatible.encryptedApiKey).not.toContain("ai-secret")
    expect(JSON.stringify(view)).not.toContain("secret")
    expect(purgeAllForMaintenance).not.toHaveBeenCalled()
  })

  it("persists an explicit Responses protocol and returns it to the renderer", async () => {
    const view = await entryTranslationApplicationService.setConfig({
      provider: "openai-compatible",
      deepl: { baseUrl: "https://api-free.deepl.com" },
      openAICompatible: {
        baseUrl: "https://ai.example.com/v1",
        apiKey: "ai-secret",
        model: "grok-4.6",
        apiProtocol: "responses",
      },
    })

    expect(view.openAICompatible.apiProtocol).toBe("responses")
    expect((stored.get("translationProviderConfig") as any).openAICompatible.apiProtocol).toBe(
      "responses",
    )
  })

  it("rejects an unknown API protocol at the IPC boundary", async () => {
    await expect(
      entryTranslationApplicationService.setConfig({
        provider: "openai-compatible",
        deepl: { baseUrl: "https://api-free.deepl.com" },
        openAICompatible: {
          baseUrl: "https://ai.example.com/v1",
          apiKey: "ai-secret",
          model: "model",
          apiProtocol: "legacy" as any,
        },
      }),
    ).rejects.toThrow("API 协议")
    expect(purgeAllForMaintenance).not.toHaveBeenCalled()
  })

  it("requires a model for an OpenAI-compatible provider", async () => {
    await expect(
      entryTranslationApplicationService.setConfig({
        provider: "openai-compatible",
        deepl: { baseUrl: "https://api-free.deepl.com" },
        openAICompatible: {
          baseUrl: "https://ai.example.com/v1",
          apiKey: "secret",
          model: " ",
        },
      }),
    ).rejects.toThrow("在线 AI 模型不能为空")
    expect(stored.has("translationProviderConfig")).toBe(false)
  })

  it("drops a saved key when its service origin changes", async () => {
    await entryTranslationApplicationService.setConfig({
      provider: "openai-compatible",
      deepl: { baseUrl: "https://api-free.deepl.com" },
      openAICompatible: {
        baseUrl: "https://first.example.com/v1",
        apiKey: "first-secret",
        model: "translation-model",
      },
    })

    const view = await entryTranslationApplicationService.setConfig({
      provider: "openai-compatible",
      deepl: { baseUrl: "https://api-free.deepl.com" },
      openAICompatible: {
        baseUrl: "https://second.example.com/v1",
        model: "translation-model",
      },
    })

    expect(view.openAICompatible.hasApiKey).toBe(false)
    const persisted = stored.get("translationProviderConfig") as any
    expect(persisted.openAICompatible.encryptedApiKey).toBeUndefined()
  })

  it("requires HTTPS except for a loopback service", async () => {
    await expect(
      entryTranslationApplicationService.setConfig({
        provider: "deepl",
        deepl: { baseUrl: "http://translator.example.com" },
        openAICompatible: { baseUrl: "https://ai.example.com/v1", model: "" },
      }),
    ).rejects.toThrow("HTTP 仅允许本机回环地址")

    await expect(
      entryTranslationApplicationService.setConfig({
        provider: "openai-compatible",
        deepl: { baseUrl: "https://api-free.deepl.com" },
        openAICompatible: {
          baseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "local-key",
          model: "local-model",
        },
      }),
    ).resolves.toMatchObject({ openAICompatible: { baseUrl: "http://127.0.0.1:11434/v1" } })
  })

  it("switches provider without deleting durable translations", async () => {
    purgeAllForMaintenance.mockRejectedValueOnce(new Error("database unavailable"))

    await expect(
      entryTranslationApplicationService.setConfig({
        provider: "deepl",
        deepl: { baseUrl: "https://api-free.deepl.com", apiKey: "secret" },
        openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
      }),
    ).resolves.toMatchObject({ provider: "deepl" })
    expect(purgeAllForMaintenance).not.toHaveBeenCalled()
    expect(stored.has("translationProviderConfig")).toBe(true)
  })

  it("tests an OpenAI-compatible provider through an isolated Electron session", async () => {
    stored.set("translationProviderConfig", {
      provider: "openai-compatible",
      deepl: { baseUrl: "https://api-free.deepl.com" },
      openAICompatible: {
        baseUrl: "https://ai.example.com/v1",
        encryptedApiKey: Buffer.from("encrypted:ai-secret").toString("base64"),
        model: "translation-model",
      },
    })
    const globalFetch = vi.fn().mockRejectedValue(new Error("Node fetch must not be used"))
    vi.stubGlobal("fetch", globalFetch)
    translationSessionFetch.mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "你好" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    await expect(entryTranslationApplicationService.testConfig()).resolves.toEqual({
      translatedText: "你好",
    })

    expect(session.fromPartition).toHaveBeenCalledWith("suhui-translation-system", {
      cache: false,
    })
    expect(translationSessionSetProxy).toHaveBeenCalledWith({ mode: "system" })
    expect(translationSessionFetch).toHaveBeenCalledWith(
      "https://ai.example.com/v1/chat/completions",
      expect.objectContaining({
        credentials: "omit",
        headers: expect.objectContaining({ Authorization: "Bearer ai-secret" }),
        signal: expect.any(AbortSignal),
      }),
    )
    expect(globalFetch).not.toHaveBeenCalled()
  })

  it("applies the saved app proxy to the isolated translation session", async () => {
    stored.set("proxy", "http://127.0.0.1:7890")
    stored.set("translationProviderConfig", {
      provider: "deepl",
      deepl: {
        baseUrl: "https://api-free.deepl.com",
        encryptedApiKey: Buffer.from("encrypted:deepl-secret").toString("base64"),
      },
      openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
    })
    translationSessionFetch.mockResolvedValue(
      new Response(JSON.stringify({ translations: [{ text: "你好" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    await expect(entryTranslationApplicationService.testConfig()).resolves.toEqual({
      translatedText: "你好",
    })

    expect(translationSessionSetProxy).toHaveBeenCalledWith({
      proxyRules: "http://127.0.0.1:7890,direct://",
      proxyBypassRules: "<local>",
    })
    const proxyHash = createHash("sha256").update("http://127.0.0.1:7890").digest("hex")
    expect(session.fromPartition).toHaveBeenCalledWith(`suhui-translation-${proxyHash}`, {
      cache: false,
    })
  })

  it("retries isolated session initialization after setProxy fails", async () => {
    stored.set("proxy", "http://127.0.0.1:9999")
    stored.set("translationProviderConfig", {
      provider: "deepl",
      deepl: {
        baseUrl: "https://api-free.deepl.com",
        encryptedApiKey: Buffer.from("encrypted:deepl-secret").toString("base64"),
      },
      openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
    })
    translationSessionSetProxy
      .mockRejectedValueOnce(new Error("proxy initialization failed"))
      .mockResolvedValueOnce(undefined)
    translationSessionFetch.mockResolvedValue(
      new Response(JSON.stringify({ translations: [{ text: "你好" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    await expect(entryTranslationApplicationService.testConfig()).rejects.toThrow(
      "proxy initialization failed",
    )
    await expect(entryTranslationApplicationService.testConfig()).resolves.toEqual({
      translatedText: "你好",
    })

    expect(translationSessionSetProxy).toHaveBeenCalledTimes(2)
  })

  it("rejects a cached translation without matching source and config fingerprints", async () => {
    stored.set("translationProviderConfig", {
      provider: "deepl",
      deepl: {
        baseUrl: "https://api-free.deepl.com",
        encryptedApiKey: Buffer.from("encrypted:secret").toString("base64"),
      },
      openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
    })
    getEntryMany.mockResolvedValue([{ id: "entry-1", title: "Fresh title" }])
    getTranslation.mockResolvedValue({
      entryId: "entry-1",
      language: "zh-CN",
      title: "旧标题",
      sourceHash: "stale-source",
      configHash: "stale-config",
    })
    const globalFetch = vi.fn().mockRejectedValue(new Error("Node fetch must not be used"))
    vi.stubGlobal("fetch", globalFetch)
    translationSessionFetch.mockResolvedValue(
      new Response(JSON.stringify({ translations: [{ text: "新标题" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    await expect(
      entryTranslationApplicationService.generate({
        entryId: "entry-1",
        language: "zh-CN",
        target: "content",
      }),
    ).resolves.toMatchObject({ title: "新标题" })
    expect(replaceTranslation).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "新标题",
        sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        configHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    )
    expect(globalFetch).not.toHaveBeenCalled()
  })

  it("translates article batches with five workers and reports partial HTML", async () => {
    stored.set("translationProviderConfig", {
      provider: "deepl",
      deepl: {
        baseUrl: "https://api-free.deepl.com",
        encryptedApiKey: Buffer.from("encrypted:secret").toString("base64"),
      },
      openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
    })
    const paragraphs = ["A short paragraph.", "B short paragraph.", "C short paragraph."]
    getEntryMany.mockResolvedValue([
      { id: "entry-progress", content: paragraphs.map((text) => `<p>${text}</p>`).join("") },
    ])
    let activeRequests = 0
    let maximumActiveRequests = 0
    translationSessionFetch.mockImplementation(async (_url, init) => {
      activeRequests += 1
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)
      const request = JSON.parse(String(init?.body)) as { text: string[] }
      await new Promise((resolve) => setTimeout(resolve, request.text[0]!.startsWith("A") ? 20 : 5))
      activeRequests -= 1
      return new Response(
        JSON.stringify({ translations: request.text.map((text) => ({ text: `译${text[0]}` })) }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    })
    const progress = vi.fn()

    const result = await entryTranslationApplicationService.generate(
      {
        requestId: "request-progress",
        entryId: "entry-progress",
        language: "zh-CN",
        target: "content",
        withContent: true,
      },
      progress,
    )

    expect(maximumActiveRequests).toBe(3)
    expect(progress).toHaveBeenCalledTimes(4)
    expect(progress.mock.calls.map(([event]) => event.completedBatches)).toEqual([0, 1, 2, 3])
    expect(progress.mock.calls[0]![0]).toMatchObject({ totalBatches: 3 })
    expect(progress.mock.calls[1]![0].translation.content).toContain("译B")
    expect(progress.mock.calls[1]![0].translation.content).toContain(paragraphs[0])
    expect(result.content).toBe("<p>译A</p><p>译B</p><p>译C</p>")
    expect(replaceTranslation).toHaveBeenCalledOnce()
    const events = vi.mocked(logger.info).mock.calls.map((call) => JSON.parse(String(call[1])))
    expect(events[0]).toMatchObject({ event: "job.queued", operation: "article" })
    expect(events.at(-1)).toMatchObject({ event: "job.completed", elapsedMs: expect.any(Number) })
    expect(new Set(events.map((event) => event.traceId)).size).toBe(1)
    expect(
      events.filter((event) => event.event === "request.started").map((event) => event.batchIndex),
    ).toEqual([1, 2, 3])
    expect(JSON.stringify(events)).not.toContain("A short paragraph")
  })

  it("starts body translation while the title is still pending, within five request slots", async () => {
    stored.set("translationProviderConfig", {
      provider: "deepl",
      deepl: {
        baseUrl: "https://api-free.deepl.com",
        encryptedApiKey: Buffer.from("encrypted:secret").toString("base64"),
      },
      openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
    })
    getEntryMany.mockResolvedValue([
      {
        id: "entry-concurrent-title",
        title: "Title",
        content: "<p>A short paragraph.</p><p>B</p>",
      },
    ])
    let releaseTitle!: () => void
    const titleGate = new Promise<void>((resolve) => {
      releaseTitle = resolve
    })
    let active = 0
    let maximumActive = 0
    translationSessionFetch.mockImplementation(async (_url, init) => {
      const { text } = JSON.parse(String(init.body)) as { text: string[] }
      active += 1
      maximumActive = Math.max(maximumActive, active)
      if (text[0] === "Title") await titleGate
      active -= 1
      return new Response(
        JSON.stringify({ translations: text.map((item) => ({ text: `译${item[0]}` })) }),
      )
    })
    const progress = vi.fn()
    const job = entryTranslationApplicationService.generate(
      {
        requestId: "concurrent-title",
        entryId: "entry-concurrent-title",
        language: "zh-CN",
        target: "content",
        withContent: true,
      },
      progress,
    )
    try {
      await vi.waitFor(() => expect(progress).toHaveBeenCalledTimes(3))
      expect(progress.mock.calls[0]![0].translation.title).toBeNull()
      expect(progress.mock.calls[1]![0].translation.content).toContain("译A")
      expect(replaceTranslation).not.toHaveBeenCalled()
      expect(maximumActive).toBe(2)
    } finally {
      releaseTitle()
    }
    await expect(job).resolves.toMatchObject({ title: "译T", content: "<p>译A</p><p>译B</p>" })
    expect(replaceTranslation).toHaveBeenCalledOnce()
  })

  it("translates the title when the body has no translatable text", async () => {
    stored.set("translationProviderConfig", {
      provider: "deepl",
      deepl: {
        baseUrl: "https://api-free.deepl.com",
        encryptedApiKey: Buffer.from("encrypted:secret").toString("base64"),
      },
      openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
    })
    getEntryMany.mockResolvedValue([
      { id: "code-only", title: "Title", content: "<pre>Code</pre>" },
    ])
    translationSessionFetch.mockResolvedValue(
      new Response(JSON.stringify({ translations: [{ text: "标题" }] })),
    )
    await expect(
      entryTranslationApplicationService.generate({
        entryId: "code-only",
        language: "zh-CN",
        target: "content",
        withContent: true,
      }),
    ).resolves.toMatchObject({ title: "标题", content: "<pre>Code</pre>" })
    expect(translationSessionFetch).toHaveBeenCalledOnce()
  })

  it("continues after a failed batch and never persists a partially failed article", async () => {
    stored.set("translationProviderConfig", {
      provider: "deepl",
      deepl: {
        baseUrl: "https://api-free.deepl.com",
        encryptedApiKey: Buffer.from("encrypted:secret").toString("base64"),
      },
      openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
    })
    const paragraphs = ["A short paragraph.", "B short paragraph.", "C short paragraph."]
    getEntryMany.mockResolvedValue([
      { id: "entry-failure", content: paragraphs.map((text) => `<p>${text}</p>`).join("") },
    ])
    const requested: string[] = []
    let secondWorkerSettled = false
    translationSessionFetch.mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { text: string[] }
      requested.push(request.text[0]![0]!)
      if (request.text[0]!.startsWith("A")) throw new Error("batch failed")
      await new Promise((resolve) => setTimeout(resolve, 5))
      secondWorkerSettled = true
      return new Response(JSON.stringify({ translations: [{ text: "译B" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    })

    await expect(
      entryTranslationApplicationService.generate({
        requestId: "request-failure",
        entryId: "entry-failure",
        language: "zh-CN",
        target: "content",
        withContent: true,
      }),
    ).resolves.toMatchObject({
      batchState: {
        completedBatches: 2,
        totalBatches: 3,
        failedBatches: [{ id: "content:1", error: expect.stringContaining("batch failed") }],
      },
    })

    expect(requested).toEqual(["A", "B", "C"])
    expect(secondWorkerSettled).toBe(true)
    expect(replaceTranslation).not.toHaveBeenCalled()
    const failures = vi.mocked(logger.warn).mock.calls.map((call) => JSON.parse(String(call[1])))
    expect(failures.map((event) => event.event)).toEqual(["request.failed", "batch.failed"])
    expect(failures[0].traceId).toBe(failures[1].traceId)
  })

  it("splits large body paragraphs without requesting the description", async () => {
    stored.set("translationProviderConfig", {
      provider: "deepl",
      deepl: {
        baseUrl: "https://api-free.deepl.com",
        encryptedApiKey: Buffer.from("encrypted:secret").toString("base64"),
      },
      openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
    })
    const sentenceA = `${"A".repeat(1_200)}. `
    const sentenceB = `${"B".repeat(1_200)}。`
    getEntryMany.mockResolvedValue([
      {
        id: "large-paragraph",
        title: "Title",
        description: `  ${sentenceA}${sentenceB}\n\nLast paragraph.`,
        readabilityContent: `<p>${sentenceA}${sentenceB}</p><p>Last paragraph.</p>`,
      },
    ])
    let active = 0
    let maximumActive = 0
    translationSessionFetch.mockImplementation(async (_url, init) => {
      const { text } = JSON.parse(String(init.body)) as { text: string[] }
      expect(text.join("").length).toBeLessThanOrEqual(2_000)
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, text[0]!.startsWith("A") ? 10 : 1))
      active -= 1
      return new Response(
        JSON.stringify({ translations: text.map((item) => ({ text: `译${item[0]}` })) }),
      )
    })
    const progress = vi.fn(() => expect(replaceTranslation).not.toHaveBeenCalled())
    const result = await entryTranslationApplicationService.generate(
      {
        requestId: "large-paragraph-request",
        entryId: "large-paragraph",
        language: "zh-CN",
        target: "readabilityContent",
        withContent: true,
      },
      progress,
    )
    expect(result).toMatchObject({
      title: "译T",
      description: null,
      readabilityContent: "<p>译A 译B</p><p>译L</p>",
    })
    expect(maximumActive).toBe(4)
    expect(progress).toHaveBeenCalledTimes(5)
    expect(replaceTranslation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: result.title,
        readabilityContent: result.readabilityContent,
      }),
      "readabilityContent",
    )
  })

  it("continues scheduling title fragments when the concurrent body request fails", async () => {
    stored.set("translationProviderConfig", {
      provider: "deepl",
      deepl: {
        baseUrl: "https://api-free.deepl.com",
        encryptedApiKey: Buffer.from("encrypted:secret").toString("base64"),
      },
      openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
    })
    getEntryMany.mockResolvedValue([
      {
        id: "stop-description",
        title: "A".repeat(5_000),
        description: "Never request this summary",
        content: "<p>Body</p>",
      },
    ])
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const requested: string[] = []
    translationSessionFetch.mockImplementation(async (_url, init) => {
      const { text } = JSON.parse(String(init.body)) as { text: string[] }
      requested.push(text[0]!)
      if (text[0] === "Body") throw new Error("body failed")
      await pending
      return new Response(JSON.stringify({ translations: [{ text: "partial description" }] }))
    })
    const job = entryTranslationApplicationService.generate({
      entryId: "stop-description",
      language: "zh-CN",
      target: "content",
      withContent: true,
    })
    const resolved = expect(job).resolves.toMatchObject({
      batchState: { failedBatches: [{ id: "content:1" }] },
    })
    try {
      await vi.waitFor(() => expect(requested.length).toBeGreaterThanOrEqual(2))
    } finally {
      release()
    }
    await resolved
    expect(requested).toEqual(["A".repeat(2_000), "Body", "A".repeat(2_000), "A".repeat(1_000)])
    expect(replaceTranslation).not.toHaveBeenCalled()
  })

  it("does not persist when a progress callback fails", async () => {
    stored.set("translationProviderConfig", {
      provider: "deepl",
      deepl: {
        baseUrl: "https://api-free.deepl.com",
        encryptedApiKey: Buffer.from("encrypted:secret").toString("base64"),
      },
      openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
    })
    getEntryMany.mockResolvedValue([{ id: "entry-progress-failure", content: "<p>Hello</p>" }])
    translationSessionFetch.mockResolvedValue(
      new Response(JSON.stringify({ translations: [{ text: "你好" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    await expect(
      entryTranslationApplicationService.generate(
        {
          requestId: "request-progress-failure",
          entryId: "entry-progress-failure",
          language: "zh-CN",
          target: "content",
          withContent: true,
        },
        () => {
          throw new Error("progress delivery failed")
        },
      ),
    ).rejects.toThrow("progress delivery failed")
    expect(replaceTranslation).not.toHaveBeenCalled()
  })

  it.each(["completed", "incomplete", "failed", "cancelled", "in_progress", "queued"])(
    "keeps mixed plain-text/JSON article batches in their original HTML slots (last batch status: %s)",
    async (status) => {
      stored.set("translationProviderConfig", {
        provider: "openai-compatible",
        deepl: { baseUrl: "https://api-free.deepl.com" },
        openAICompatible: {
          baseUrl: "https://ai.example/v1",
          encryptedApiKey: Buffer.from("encrypted:secret").toString("base64"),
          model: "model",
          apiProtocol: "responses",
        },
      })
      getEntryMany.mockResolvedValue([
        {
          id: "plain-text-entry",
          title: "Title",
          description: "Summary",
          content: '<p>First</p><p>Read <a href="https://example.com">link</a></p>',
        },
      ])
      translationSessionFetch.mockImplementation(async (_url, init) => {
        const input = JSON.parse(JSON.parse(String(init.body)).input)
        const output_text =
          typeof input.text === "string"
            ? `译${input.text}`
            : JSON.stringify({ translations: input.texts.map((text: string) => `译${text}`) })
        return new Response(
          JSON.stringify({
            status: input.texts ? status : "completed",
            output_text,
          }),
        )
      })
      const progress = vi.fn()
      const result = entryTranslationApplicationService.generate(
        {
          entryId: "plain-text-entry",
          requestId: "plain-text-request",
          language: "zh-CN",
          target: "content",
          withContent: true,
        },
        progress,
      )
      if (status !== "completed") {
        await expect(result).resolves.toMatchObject({
          batchState: {
            failedBatches: [
              {
                id: "content:2",
                error: expect.stringContaining(
                  ["failed", "cancelled"].includes(status) ? "译文生成失败" : "译文生成未完成",
                ),
              },
            ],
          },
        })
        expect(replaceTranslation).not.toHaveBeenCalled()
        expect(
          progress.mock.calls.some(([event]) => event.translation?.content?.includes("译First")),
        ).toBe(true)
      } else {
        await expect(result).resolves.toMatchObject({
          title: "译Title",
          content: '<p>译First</p><p>译Read <a href="https://example.com">译link</a></p>',
        })
        expect(replaceTranslation).toHaveBeenCalledOnce()
      }
      expect(translationSessionFetch).toHaveBeenCalledTimes(3)
    },
  )

  describe("failed batch retries", () => {
    const input = {
      entryId: "retry-entry",
      language: "zh-CN" as const,
      target: "content" as const,
      withContent: true,
    }
    beforeEach(() => {
      stored.set("translationProviderConfig", {
        provider: "deepl",
        deepl: {
          baseUrl: "https://api-free.deepl.com",
          encryptedApiKey: Buffer.from("encrypted:secret").toString("base64"),
        },
        openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
      })
      getEntryMany.mockResolvedValue([
        { id: input.entryId, title: "Title", content: "<p>A</p><p>B</p><p>C</p>" },
      ])
    })
    const reply = (text: string) => new Response(JSON.stringify({ translations: [{ text }] }))
    it("runs five distinct retries concurrently, deduplicates a batch and queues the sixth", async () => {
      getEntryMany.mockResolvedValue([
        { content: Array.from({ length: 6 }, (_, n) => `<p>${n}</p>`).join("") },
      ])
      translationSessionFetch.mockRejectedValue(new Error("offline"))
      const partial = await entryTranslationApplicationService.generate(input)
      const releases: Array<() => void> = []
      const started: string[] = []
      translationSessionFetch.mockImplementation(async (_url, init) => {
        const text = JSON.parse(init.body).text[0]
        started.push(text)
        await new Promise<void>((resolve) => releases.push(resolve))
        return reply(`译${text}`)
      })
      const retry = (index: number) =>
        entryTranslationApplicationService.generate({
          ...input,
          retry: { sessionId: partial.batchState!.sessionId, batchId: `content:${index + 1}` },
        })
      const jobs = Array.from({ length: 6 }, (_, n) => retry(n))
      const duplicate = retry(0)
      let configChanged = false
      const configUpdate = entryTranslationApplicationService
        .setConfig({
          provider: "deepl",
          deepl: { baseUrl: "https://new.example.com", apiKey: "new-key" },
          openAICompatible: { baseUrl: "https://ai.example.com", model: "next" },
        })
        .then(() => {
          configChanged = true
        })
      try {
        await vi.waitFor(() => expect(started).toHaveLength(5))
        releases[0]!()
        await vi.waitFor(() => expect(started).toHaveLength(6))
        expect(started).toEqual(["0", "1", "2", "3", "4", "5"])
        expect(configChanged).toBe(false)
      } finally {
        releases.forEach((release) => release())
      }
      const results = await Promise.all([...jobs, duplicate])
      expect(results.some((result) => result.batchState?.completedBatches === 6)).toBe(true)
      expect(saveBatch).toHaveBeenCalledTimes(6)
      await configUpdate
      expect(configChanged).toBe(true)
    })

    it("loads saved successful batches after restart and provider change, sending only missing text", async () => {
      const saved: any[] = []
      saveBatch.mockImplementation(async (row) => {
        saved.push(row)
      })
      getBatches.mockImplementation(async () => saved)
      translationSessionFetch.mockImplementation(async (_url, init) => {
        const text = JSON.parse(init.body).text[0]
        if (text === "B") throw new Error("offline")
        return reply(`旧${text}`)
      })
      await entryTranslationApplicationService.generate(input)
      expect(saved).toHaveLength(3)
      await entryTranslationApplicationService.setConfig({
        provider: "deepl",
        deepl: { baseUrl: "https://new.example.com", apiKey: "new-key" },
        openAICompatible: { baseUrl: "https://ai.example.com", model: "new-model" },
      })
      const restarted = new EntryTranslationApplicationService()
      translationSessionFetch.mockClear().mockImplementation(async (_url, init) => {
        expect(JSON.parse(init.body).text).toEqual(["B"])
        return reply("新B")
      })
      const progress = vi.fn()
      const result = await restarted.generate({ ...input, requestId: "after-restart" }, progress)
      expect(translationSessionFetch).toHaveBeenCalledOnce()
      expect(progress.mock.calls[0]![0].translation.content).toBe("<p>旧A</p><p>B</p><p>旧C</p>")
      expect(result.content).toBe("<p>旧A</p><p>新B</p><p>旧C</p>")
      expect(result.title).toBe("旧Title")
      expect(purgeAllForMaintenance).not.toHaveBeenCalled()
    })

    it("reuses a complete database translation after changing provider without contacting AI", async () => {
      translationSessionFetch.mockImplementation(async (_url, init) =>
        reply(`译${JSON.parse(init.body).text[0]}`),
      )
      await entryTranslationApplicationService.generate(input)
      const row = replaceTranslation.mock.calls.at(-1)![0]
      getTranslation.mockResolvedValue(row)
      await entryTranslationApplicationService.setConfig({
        provider: "openai-compatible",
        deepl: { baseUrl: "https://api-free.deepl.com" },
        openAICompatible: { baseUrl: "https://ai.example.com", model: "different-model" },
      })
      translationSessionFetch.mockClear()
      const result = await entryTranslationApplicationService.generate(input)
      expect(result.content).toBe(row.content)
      expect(result.title).toBe(row.title)
      expect(translationSessionFetch).not.toHaveBeenCalled()
      expect(purgeAllForMaintenance).not.toHaveBeenCalled()
    })

    it("treats a denied key as one job failure without repeatedly requesting it per paragraph", async () => {
      const decrypt = vi.spyOn(safeStorage, "decryptString").mockImplementation(() => {
        throw new Error("key denied")
      })
      try {
        await expect(entryTranslationApplicationService.generate(input)).rejects.toThrow(
          "key denied",
        )
        expect(decrypt).toHaveBeenCalledOnce()
        expect(translationSessionFetch).not.toHaveBeenCalled()
        expect(saveBatch).not.toHaveBeenCalled()
      } finally {
        decrypt.mockRestore()
      }
    })

    it("shows saved paragraphs even if credentials for missing paragraphs cannot be read", async () => {
      getBatches.mockResolvedValue([{ batchId: "content:1", values: ["已存A"] }])
      const decrypt = vi.spyOn(safeStorage, "decryptString").mockImplementation(() => {
        throw new Error("key denied")
      })
      const progress = vi.fn()
      try {
        await expect(
          entryTranslationApplicationService.generate(
            { ...input, requestId: "saved-key-denied" },
            progress,
          ),
        ).rejects.toThrow("key denied")
        expect(progress).toHaveBeenCalledWith(
          expect.objectContaining({
            translation: expect.objectContaining({ content: "<p>已存A</p><p>B</p><p>C</p>" }),
          }),
        )
        expect(decrypt).toHaveBeenCalledOnce()
        expect(translationSessionFetch).not.toHaveBeenCalled()
      } finally {
        decrypt.mockRestore()
      }
    })
    it("retries a failed database save using the already generated text", async () => {
      getEntryMany.mockResolvedValue([{ content: "<p>A</p>" }])
      translationSessionFetch.mockImplementation(async () => reply("译A"))
      saveBatch.mockRejectedValueOnce(new Error("disk full"))
      const partial = await entryTranslationApplicationService.generate(input)
      expect(partial.batchState?.failedBatches).toHaveLength(1)
      expect(partial.content).not.toContain("译A")
      const result = await entryTranslationApplicationService.generate({
        ...input,
        retry: { sessionId: partial.batchState!.sessionId, batchId: "content:1" },
      })
      expect(result.content).toBe("<p>译A</p>")
      expect(translationSessionFetch).toHaveBeenCalledOnce()
      expect(saveBatch).toHaveBeenCalledTimes(2)
    })

    it("pauses database changes until accepted batches are saved and invalidates old sessions", async () => {
      const service = new EntryTranslationApplicationService()
      getEntryMany.mockResolvedValue([{ content: "<p>A</p>" }])
      let release!: () => void
      translationSessionFetch.mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return reply("译A")
      })
      const running = service.generate(input)
      await vi.waitFor(() => expect(release).toBeDefined())
      let paused = false
      const pausing = service.pauseForDatabaseChange().then((resume) => {
        paused = true
        return resume
      })
      expect(() => service.generate(input)).toThrow("数据库维护")
      expect(paused).toBe(false)
      release()
      await running
      const resume = await pausing
      expect(saveBatch).toHaveBeenCalledOnce()
      expect(replaceTranslation).toHaveBeenCalledOnce()
      expect(() => service.generate(input)).toThrow("数据库维护")
      resume()
    })

    it("explicit retranslation invalidates old sessions of the other body target", async () => {
      const service = new EntryTranslationApplicationService()
      getEntryMany.mockResolvedValue([
        { title: "Title", content: "<p>A</p>", readabilityContent: "<p>B</p>" },
      ])
      translationSessionFetch.mockImplementation(async (_url, init) => {
        const text = JSON.parse(init.body).text[0]
        if (text === "B") throw new Error("offline")
        return reply(`旧${text}`)
      })
      const partial = await service.generate({ ...input, target: "readabilityContent" })
      translationSessionFetch.mockImplementation(async (_url, init) =>
        reply(`新${JSON.parse(init.body).text[0]}`),
      )
      await service.generate({ ...input, force: true })
      expect(clearBatches).toHaveBeenCalledOnce()
      translationSessionFetch.mockClear()
      await expect(
        service.generate({
          ...input,
          target: "readabilityContent",
          retry: { sessionId: partial.batchState!.sessionId, batchId: "readabilityContent:1" },
        }),
      ).rejects.toThrow("会话已过期")
      expect(translationSessionFetch).not.toHaveBeenCalled()
    })
    it("keeps successful slots and retries only the selected failure, then writes a clean complete cache", async () => {
      const attempts: string[] = []
      translationSessionFetch.mockImplementation(async (_url, init) => {
        const text = JSON.parse(init.body).text[0]
        attempts.push(text)
        if (text === "A" || text === "B") throw new DOMException("timed out", "TimeoutError")
        return reply(`译${text}`)
      })
      const partial = await entryTranslationApplicationService.generate(input)
      expect(attempts).toEqual(["Title", "A", "B", "C"])
      expect(partial.batchState).toMatchObject({
        completedBatches: 1,
        totalBatches: 3,
        failedBatches: [{ id: "content:1" }, { id: "content:2" }],
      })
      expect(partial.content).toContain("译C")
      expect(partial.content).toContain("data-suhui-translation-retry")
      expect(replaceTranslation).not.toHaveBeenCalled()
      translationSessionFetch.mockImplementation(async (_url, init) => {
        const text = JSON.parse(init.body).text[0]
        attempts.push(text)
        return reply(`译${text}`)
      })
      const retry = { sessionId: partial.batchState!.sessionId, batchId: "content:1" }
      const next = await entryTranslationApplicationService.generate({ ...input, retry })
      expect(attempts).toEqual(["Title", "A", "B", "C", "A"])
      expect(next.batchState).toMatchObject({
        completedBatches: 2,
        failedBatches: [{ id: "content:2" }],
      })
      expect(replaceTranslation).not.toHaveBeenCalled()
      const done = await entryTranslationApplicationService.generate({
        ...input,
        retry: { ...retry, batchId: "content:2" },
      })
      expect(attempts).toEqual(["Title", "A", "B", "C", "A", "B"])
      expect(done.content).toBe("<p>译A</p><p>译B</p><p>译C</p>")
      expect(done.title).toBe("译Title")
      expect(replaceTranslation).toHaveBeenCalledOnce()
      expect(replaceTranslation.mock.calls[0]![0]).not.toHaveProperty("batchState")
      expect(replaceTranslation.mock.calls[0]![0].content).not.toContain("translation-retry")
    })
    it("retains the failed original and successful body when retry fails again or title fails", async () => {
      translationSessionFetch.mockImplementation(async (_url, init) => {
        const text = JSON.parse(init.body).text[0]
        if (text === "Title") throw new Error("title failed")
        return reply(`译${text}`)
      })
      const partial = await entryTranslationApplicationService.generate(input)
      expect(partial.batchState).toMatchObject({
        completedBatches: 3,
        failedBatches: [{ id: "title:1" }],
      })
      expect(partial.content).toBe("<p>译A</p><p>译B</p><p>译C</p>")
      translationSessionFetch.mockClear()
      const next = await entryTranslationApplicationService.generate({
        ...input,
        retry: { sessionId: partial.batchState!.sessionId, batchId: "title:1" },
      })
      expect(next.title).toBeNull()
      expect(next.content).toBe(partial.content)
      expect(next.batchState!.failedBatches[0]!.error).toContain("title failed")
      expect(translationSessionFetch).toHaveBeenCalledOnce()
      expect(replaceTranslation).not.toHaveBeenCalled()
    })
    it.each(["source", "entry", "language", "target", "missing"])(
      "rejects a %s mismatch before sending retry text",
      async (mismatch) => {
        translationSessionFetch.mockRejectedValue(new Error("temporary failure"))
        const partial = await entryTranslationApplicationService.generate(input)
        const retryInput = {
          ...input,
          retry: { sessionId: partial.batchState!.sessionId, batchId: "content:1" },
        }
        if (mismatch === "source")
          getEntryMany.mockResolvedValue([
            { id: input.entryId, title: "Changed", content: "<p>Changed</p>" },
          ])
        if (mismatch === "entry") retryInput.entryId = "other-entry"
        if (mismatch === "language") Object.assign(retryInput, { language: "ja" })
        if (mismatch === "target") Object.assign(retryInput, { target: "readabilityContent" })
        if (mismatch === "missing")
          retryInput.retry.sessionId = "00000000-0000-0000-0000-000000000000"
        translationSessionFetch.mockClear()
        await expect(entryTranslationApplicationService.generate(retryInput)).rejects.toThrow(
          "会话已过期",
        )
        expect(translationSessionFetch).not.toHaveBeenCalled()
      },
    )
    it("reports a cache-write failure after recovering the final batch without saving partial metadata", async () => {
      translationSessionFetch.mockImplementation(async (_url, init) => {
        const text = JSON.parse(init.body).text[0]
        if (text === "A") throw new Error("failed")
        return reply(`译${text}`)
      })
      const partial = await entryTranslationApplicationService.generate(input)
      translationSessionFetch.mockImplementation(async () => reply("译A"))
      replaceTranslation.mockRejectedValueOnce(new Error("cache unavailable"))
      const progress = vi.fn()
      await expect(
        entryTranslationApplicationService.generate(
          {
            ...input,
            requestId: "cache-failure",
            retry: { sessionId: partial.batchState!.sessionId, batchId: "content:1" },
          },
          progress,
        ),
      ).rejects.toThrow("cache unavailable")
      expect(progress.mock.calls.at(-1)![0].translation.batchState.failedBatches).toEqual([])
      expect(replaceTranslation.mock.calls.at(-1)![0]).not.toHaveProperty("batchState")
    })
    it("expires the oldest unfinished session at the retention limit", async () => {
      translationSessionFetch.mockRejectedValue(new Error("failed"))
      const oldest = await entryTranslationApplicationService.generate(input)
      for (let index = 0; index < 16; index++)
        await entryTranslationApplicationService.generate({
          ...input,
          entryId: `retained-${index}`,
        })
      translationSessionFetch.mockClear()
      await expect(
        entryTranslationApplicationService.generate({
          ...input,
          retry: { sessionId: oldest.batchState!.sessionId, batchId: "content:1" },
        }),
      ).rejects.toThrow("会话已过期")
      expect(translationSessionFetch).not.toHaveBeenCalled()
    })
    it("rejects retrying a successful batch without repeating any request", async () => {
      translationSessionFetch.mockImplementation(async (_url, init) => {
        const text = JSON.parse(init.body).text[0]
        if (text === "B") throw new Error("failed")
        return reply(`译${text}`)
      })
      const partial = await entryTranslationApplicationService.generate(input)
      translationSessionFetch.mockClear()
      await expect(
        entryTranslationApplicationService.generate({
          ...input,
          retry: { sessionId: partial.batchState!.sessionId, batchId: "content:1" },
        }),
      ).rejects.toThrow("该批次已完成")
      expect(translationSessionFetch).not.toHaveBeenCalled()
    })
  })

  it("rejects malformed progress request ids", () => {
    expect(() =>
      entryTranslationApplicationService.generate({
        requestId: "x".repeat(129),
        entryId: "entry-1",
        language: "zh-CN",
        target: "content",
      }),
    ).toThrow("requestId")
  })

  describe("reader and list request scopes", () => {
    beforeEach(() => {
      stored.set("translationProviderConfig", {
        provider: "deepl",
        deepl: {
          baseUrl: "https://api-free.deepl.com",
          encryptedApiKey: Buffer.from("encrypted:secret").toString("base64"),
        },
        openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
      })
      getEntryMany.mockResolvedValue([
        {
          id: "scope-entry",
          title: "Title",
          description: "Summary",
          content: "<p>Body</p>",
        },
      ])
      translationSessionFetch.mockImplementation(async (_url, init) => {
        const { text } = JSON.parse(String(init.body)) as { text: string[] }
        return new Response(
          JSON.stringify({ translations: text.map((item) => ({ text: `译${item}` })) }),
        )
      })
    })
    const input = { entryId: "scope-entry", language: "zh-CN" as const, target: "content" as const }
    const requested = () =>
      translationSessionFetch.mock.calls.flatMap(([, init]) => JSON.parse(String(init.body)).text)

    it.each(["", "<pre>Code</pre>"])(
      "does not translate summaries for a reader with an empty or code-only body: %s",
      async (content) => {
        getEntryMany.mockResolvedValue([
          { id: input.entryId, title: "Title", description: "Summary", content },
        ])
        await expect(
          entryTranslationApplicationService.generate({ ...input, withContent: true }),
        ).resolves.toMatchObject({ title: "译Title", description: null })
        expect(requested()).toEqual(["Title"])
      },
    )

    it.each([true, false])(
      "preserves the other scope's cached fields (reader first: %s)",
      async (readerFirst) => {
        let cached: unknown
        getTranslation.mockImplementation(async () => cached)
        replaceTranslation.mockImplementation(async (row) => {
          cached = row
        })
        await entryTranslationApplicationService.generate({ ...input, withContent: readerFirst })
        expect(requested()).toEqual(readerFirst ? ["Title", "Body"] : ["Title", "Summary"])
        translationSessionFetch.mockClear()
        const result = await entryTranslationApplicationService.generate({
          ...input,
          withContent: !readerFirst,
        })
        expect(requested()).toEqual(readerFirst ? ["Summary"] : ["Body"])
        expect(result).toMatchObject({
          title: "译Title",
          description: "译Summary",
          content: "<p>译Body</p>",
        })
        expect(cached).toMatchObject({
          title: result.title,
          content: result.content,
          description: result.description,
        })
      },
    )

    it("lets a queued reader succeed after the list summary times out", async () => {
      translationSessionFetch.mockImplementation(async (_url, init) => {
        const { text } = JSON.parse(String(init.body)) as { text: string[] }
        if (text[0] === "Summary") throw new DOMException("timeout", "TimeoutError")
        return new Response(
          JSON.stringify({ translations: text.map((item) => ({ text: `译${item}` })) }),
        )
      })
      const list = entryTranslationApplicationService.generate(input)
      const failed = expect(list).rejects.toThrow("摘要翻译超时")
      const reader = entryTranslationApplicationService.generate({ ...input, withContent: true })
      await failed
      await expect(reader).resolves.toMatchObject({
        title: "译Title",
        content: "<p>译Body</p>",
        description: null,
      })
      expect(replaceTranslation).toHaveBeenCalledOnce()
      expect(requested().filter((text) => text === "Summary")).toHaveLength(1)
    })

    it("preserves large list summaries and translates them only on the list request", async () => {
      getEntryMany.mockResolvedValue([
        {
          id: input.entryId,
          description: `${"A".repeat(1200)}. ${"B".repeat(1200)}。\n\nEnd.`,
          content: "<p>Body</p>",
        },
      ])
      const result = await entryTranslationApplicationService.generate(input)
      expect(requested()).toHaveLength(3)
      expect(requested()).not.toContain("Body")
      expect(result.description).toBe(`译${"A".repeat(1200)}. 译${"B".repeat(1200)}。\n\n译End.`)
      expect(result.content).toBeNull()
    })
  })

  it("translates selected text without writing the article cache", async () => {
    stored.set("translationProviderConfig", {
      provider: "deepl",
      deepl: {
        baseUrl: "https://api-free.deepl.com",
        encryptedApiKey: Buffer.from("encrypted:secret").toString("base64"),
      },
      openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
    })
    translationSessionFetch.mockResolvedValue(
      new Response(JSON.stringify({ translations: [{ text: "选区译文" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    await expect(
      entryTranslationApplicationService.translateText({
        text: "Selected text",
        language: "zh-CN",
      }),
    ).resolves.toEqual({ translatedText: "选区译文" })
    expect(replaceTranslation).not.toHaveBeenCalled()
  })

  it("rejects empty or oversized selected text before a provider request", async () => {
    await expect(
      entryTranslationApplicationService.translateText({ text: "   ", language: "zh-CN" }),
    ).rejects.toThrow("不能为空")
    await expect(
      entryTranslationApplicationService.translateText({
        text: "x".repeat(20_001),
        language: "zh-CN",
      }),
    ).rejects.toThrow("20,000")
    expect(translationSessionFetch).not.toHaveBeenCalled()
  })
})
