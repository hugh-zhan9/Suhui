import { createHash } from "node:crypto"

import { EntryService } from "@suhui/database/services/entry"
import { TranslationService } from "@suhui/database/services/translation"
import type {
  GenerateEntryTranslationInput,
  GeneratedEntryTranslation,
  TranslationProviderConfigInput,
  TranslationProviderConfigView,
} from "@suhui/shared"
import { safeStorage } from "electron"

import { store, type StoredTranslationProviderConfig } from "~/lib/store"

import { batchTranslationUnits, createHtmlTranslationPlan } from "./html"
import { translateTexts, type TranslationProviderRuntimeConfig } from "./provider"

const DEFAULT_CONFIG: StoredTranslationProviderConfig = {
  provider: "deepl",
  deepl: {
    baseUrl: "https://api-free.deepl.com",
  },
  openAICompatible: {
    baseUrl: "https://api.openai.com/v1",
    model: "",
  },
}

const SUPPORTED_LANGUAGES = new Set(["en", "ja", "zh-CN", "zh-TW", "fr-FR"])

const isLoopbackHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase().replace(/\.$/, "")
  return (
    normalized === "localhost" ||
    normalized === "[::1]" ||
    normalized === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  )
}

const normalizeBaseUrl = (value: string) => {
  const url = new URL(value.trim())
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("翻译服务 Base URL 必须使用 HTTP 或 HTTPS")
  }
  if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) {
    throw new Error("在线翻译服务必须使用 HTTPS；HTTP 仅允许本机回环地址")
  }
  if (url.username || url.password) {
    throw new Error("翻译服务 Base URL 不得包含用户名或密码")
  }
  url.hash = ""
  url.search = ""
  return url.toString().replace(/\/$/, "")
}

const encrypt = (value: string) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("当前系统无法安全保存翻译服务 API Key")
  }
  return safeStorage.encryptString(value).toString("base64")
}

const decrypt = (value?: string | null) => {
  if (!value) return ""
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("当前系统无法读取翻译服务 API Key")
  }
  return safeStorage.decryptString(Buffer.from(value, "base64"))
}

const getStoredConfig = (): StoredTranslationProviderConfig => {
  const stored = store.get("translationProviderConfig")
  return {
    provider: stored?.provider ?? DEFAULT_CONFIG.provider,
    deepl: { ...DEFAULT_CONFIG.deepl, ...stored?.deepl },
    openAICompatible: {
      ...DEFAULT_CONFIG.openAICompatible,
      ...stored?.openAICompatible,
    },
  }
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")

const sourceHash = (entry: {
  title?: string | null
  description?: string | null
  content?: string | null
  readabilityContent?: string | null
}) =>
  hash([
    entry.title ?? null,
    entry.description ?? null,
    entry.content ?? null,
    entry.readabilityContent ?? null,
  ])

const configHash = (config: StoredTranslationProviderConfig) =>
  config.provider === "deepl"
    ? hash({
        provider: config.provider,
        baseUrl: config.deepl.baseUrl,
        encryptedApiKey: config.deepl.encryptedApiKey ?? null,
      })
    : hash({
        provider: config.provider,
        baseUrl: config.openAICompatible.baseUrl,
        encryptedApiKey: config.openAICompatible.encryptedApiKey ?? null,
        model: config.openAICompatible.model,
      })

const toView = (config: StoredTranslationProviderConfig): TranslationProviderConfigView => ({
  provider: config.provider,
  deepl: {
    baseUrl: config.deepl.baseUrl,
    hasApiKey: !!config.deepl.encryptedApiKey,
  },
  openAICompatible: {
    baseUrl: config.openAICompatible.baseUrl,
    hasApiKey: !!config.openAICompatible.encryptedApiKey,
    model: config.openAICompatible.model,
  },
})

const runtimeConfig = (
  config: StoredTranslationProviderConfig,
): TranslationProviderRuntimeConfig =>
  config.provider === "deepl"
    ? {
        provider: "deepl",
        baseUrl: normalizeBaseUrl(config.deepl.baseUrl),
        apiKey: decrypt(config.deepl.encryptedApiKey),
      }
    : {
        provider: "openai-compatible",
        baseUrl: normalizeBaseUrl(config.openAICompatible.baseUrl),
        apiKey: decrypt(config.openAICompatible.encryptedApiKey),
        model: config.openAICompatible.model,
      }

const translateHtml = async (
  config: TranslationProviderRuntimeConfig,
  html: string,
  language: GenerateEntryTranslationInput["language"],
) => {
  const plan = createHtmlTranslationPlan(html)
  const translated: string[] = []
  for (const batch of batchTranslationUnits(plan.units)) {
    translated.push(...(await translateTexts(config, batch, language)))
  }
  return plan.rebuild(translated)
}

class EntryTranslationApplicationService {
  private queues = new Map<string, Promise<GeneratedEntryTranslation>>()
  private configurationBarrier: Promise<void> = Promise.resolve()

  getConfig(): TranslationProviderConfigView {
    return toView(getStoredConfig())
  }

  async setConfig(input: TranslationProviderConfigInput): Promise<TranslationProviderConfigView> {
    if (!input || !input.deepl || !input.openAICompatible) {
      throw new Error("翻译服务配置不完整")
    }
    if (input.provider !== "deepl" && input.provider !== "openai-compatible") {
      throw new Error("不支持的翻译服务")
    }
    const activeJobs = [...this.queues.values()]
    const update = this.configurationBarrier.then(async () => {
      await Promise.allSettled(activeJobs)
      const current = getStoredConfig()
      const deeplBaseUrl = input.deepl.baseUrl.trim()
        ? normalizeBaseUrl(input.deepl.baseUrl)
        : current.deepl.baseUrl
      const aiBaseUrl = input.openAICompatible.baseUrl.trim()
        ? normalizeBaseUrl(input.openAICompatible.baseUrl)
        : current.openAICompatible.baseUrl
      const next: StoredTranslationProviderConfig = {
        provider: input.provider,
        deepl: {
          baseUrl: deeplBaseUrl,
          encryptedApiKey: input.deepl.apiKey?.trim()
            ? encrypt(input.deepl.apiKey.trim())
            : new URL(deeplBaseUrl).origin === new URL(current.deepl.baseUrl).origin
              ? current.deepl.encryptedApiKey
              : undefined,
        },
        openAICompatible: {
          baseUrl: aiBaseUrl,
          encryptedApiKey: input.openAICompatible.apiKey?.trim()
            ? encrypt(input.openAICompatible.apiKey.trim())
            : new URL(aiBaseUrl).origin === new URL(current.openAICompatible.baseUrl).origin
              ? current.openAICompatible.encryptedApiKey
              : undefined,
          model: input.openAICompatible.model.trim(),
        },
      }
      if (next.provider === "openai-compatible" && !next.openAICompatible.model) {
        throw new Error("在线 AI 模型不能为空")
      }
      await TranslationService.purgeAllForMaintenance()
      store.set("translationProviderConfig", next)
      return next
    })
    this.configurationBarrier = update.then(
      () => undefined,
      () => undefined,
    )
    return toView(await update)
  }

  async testConfig() {
    const translated = await translateTexts(runtimeConfig(getStoredConfig()), ["Hello"], "zh-CN")
    return { translatedText: translated[0] ?? "" }
  }

  generate(input: GenerateEntryTranslationInput): Promise<GeneratedEntryTranslation> {
    if (!input?.entryId?.trim()) throw new Error("待翻译文章 ID 不能为空")
    if (!SUPPORTED_LANGUAGES.has(input.language)) throw new Error("不支持的目标语言")
    if (input.target !== "content" && input.target !== "readabilityContent") {
      throw new Error("不支持的翻译正文类型")
    }
    const configurationBarrier = this.configurationBarrier
    const key = `${input.entryId}:${input.language}`
    const previous = this.queues.get(key) ?? Promise.resolve(null)
    const job = previous
      .catch(() => null)
      .then(async () => {
        await configurationBarrier
        return this.generateNow(input)
      })
      .finally(() => {
        if (this.queues.get(key) === job) this.queues.delete(key)
      })
    this.queues.set(key, job)
    return job
  }

  private async generateNow(
    input: GenerateEntryTranslationInput,
  ): Promise<GeneratedEntryTranslation> {
    const [entry] = await EntryService.getEntryMany([input.entryId])
    if (!entry) throw new Error("待翻译文章不存在")

    const storedConfig = getStoredConfig()
    const currentSourceHash = sourceHash(entry)
    const currentConfigHash = configHash(storedConfig)
    const cached = await TranslationService.getTranslation(input.entryId, input.language)
    const cacheIsCurrent =
      cached?.sourceHash === currentSourceHash && cached.configHash === currentConfigHash
    const result: GeneratedEntryTranslation = {
      entryId: input.entryId,
      language: input.language,
      title: cacheIsCurrent ? (cached.title ?? null) : null,
      description: cacheIsCurrent ? (cached.description ?? null) : null,
      content: cacheIsCurrent ? (cached.content ?? null) : null,
      readabilityContent: cacheIsCurrent ? (cached.readabilityContent ?? null) : null,
    }
    const fields = ["title", "description"] as const
    const needsTextTranslation = fields.some((field) => !result[field] && !!entry[field]?.trim())
    const needsContentTranslation =
      !!input.withContent && !result[input.target] && !!entry[input.target]?.trim()
    if (!needsTextTranslation && !needsContentTranslation) {
      if (cached && !cacheIsCurrent) {
        await TranslationService.replaceTranslation({
          ...result,
          sourceHash: currentSourceHash,
          configHash: currentConfigHash,
        })
      }
      return result
    }

    const config = runtimeConfig(storedConfig)
    for (const field of fields) {
      const source = entry[field]
      if (!result[field] && source?.trim()) {
        result[field] = (await translateTexts(config, [source], input.language))[0] ?? null
      }
    }
    if (needsContentTranslation) {
      const source = entry[input.target]
      if (source?.trim()) {
        result[input.target] = await translateHtml(config, source, input.language)
      }
    }
    await TranslationService.replaceTranslation({
      ...result,
      sourceHash: currentSourceHash,
      configHash: currentConfigHash,
    })
    return result
  }
}

export const entryTranslationApplicationService = new EntryTranslationApplicationService()
