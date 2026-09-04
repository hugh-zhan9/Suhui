import { createHash } from "node:crypto"

import { session } from "electron"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  stored,
  purgeAllForMaintenance,
  getTranslation,
  replaceTranslation,
  getEntryMany,
  translationSessionFetch,
  translationSessionSetProxy,
} = vi.hoisted(() => ({
  stored: new Map<string, unknown>(),
  purgeAllForMaintenance: vi.fn(),
  getTranslation: vi.fn(),
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
    insertTranslation: vi.fn(),
    replaceTranslation,
    purgeAllForMaintenance,
  },
}))
vi.mock("@suhui/database/services/entry", () => ({
  EntryService: { getEntryMany },
}))

import { entryTranslationApplicationService } from "./service"

describe("translation provider configuration", () => {
  beforeEach(() => {
    stored.clear()
    purgeAllForMaintenance.mockReset().mockResolvedValue(undefined)
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
    expect(purgeAllForMaintenance).toHaveBeenCalledOnce()
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

  it("does not persist a new provider config when cache invalidation fails", async () => {
    purgeAllForMaintenance.mockRejectedValueOnce(new Error("database unavailable"))

    await expect(
      entryTranslationApplicationService.setConfig({
        provider: "deepl",
        deepl: { baseUrl: "https://api-free.deepl.com", apiKey: "secret" },
        openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
      }),
    ).rejects.toThrow("database unavailable")
    expect(stored.has("translationProviderConfig")).toBe(false)
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
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"translations":["你好"]}' } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
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

  it("translates article batches with two workers and reports partial HTML", async () => {
    stored.set("translationProviderConfig", {
      provider: "deepl",
      deepl: {
        baseUrl: "https://api-free.deepl.com",
        encryptedApiKey: Buffer.from("encrypted:secret").toString("base64"),
      },
      openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
    })
    const paragraphs = ["A".repeat(4_000), "B".repeat(4_000), "C".repeat(4_000)]
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

    expect(maximumActiveRequests).toBe(2)
    expect(progress).toHaveBeenCalledTimes(3)
    expect(progress.mock.calls.map(([event]) => event.completedBatches)).toEqual([1, 2, 3])
    expect(progress.mock.calls[0]![0]).toMatchObject({ totalBatches: 3 })
    expect(progress.mock.calls[0]![0].translation.content).toContain("译B")
    expect(progress.mock.calls[0]![0].translation.content).toContain(paragraphs[0])
    expect(result.content).toBe("<p>译A</p><p>译B</p><p>译C</p>")
    expect(replaceTranslation).toHaveBeenCalledOnce()
  })

  it("waits for active workers and never persists a partially failed article", async () => {
    stored.set("translationProviderConfig", {
      provider: "deepl",
      deepl: {
        baseUrl: "https://api-free.deepl.com",
        encryptedApiKey: Buffer.from("encrypted:secret").toString("base64"),
      },
      openAICompatible: { baseUrl: "https://api.openai.com/v1", model: "" },
    })
    const paragraphs = ["A".repeat(4_000), "B".repeat(4_000), "C".repeat(4_000)]
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
    ).rejects.toThrow("batch failed")

    expect(requested).toEqual(["A", "B"])
    expect(secondWorkerSettled).toBe(true)
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
