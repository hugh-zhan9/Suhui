import { beforeEach, describe, expect, it, vi } from "vitest"

const { stored, purgeAllForMaintenance, getTranslation, replaceTranslation, getEntryMany } =
  vi.hoisted(() => ({
    stored: new Map<string, unknown>(),
    purgeAllForMaintenance: vi.fn(),
    getTranslation: vi.fn(),
    replaceTranslation: vi.fn(),
    getEntryMany: vi.fn(),
  }))

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
    decryptString: (value: Buffer) => value.toString().replace(/^encrypted:/, ""),
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
      },
    })
    const persisted = stored.get("translationProviderConfig") as any
    expect(persisted.deepl.encryptedApiKey).not.toContain("deepl-secret")
    expect(persisted.openAICompatible.encryptedApiKey).not.toContain("ai-secret")
    expect(JSON.stringify(view)).not.toContain("secret")
    expect(purgeAllForMaintenance).toHaveBeenCalledOnce()
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ translations: [{ text: "新标题" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
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
  })
})
