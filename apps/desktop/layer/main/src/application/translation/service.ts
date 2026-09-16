import { createHash } from "node:crypto"

import { EntryService } from "@suhui/database/services/entry"
import { TranslationService } from "@suhui/database/services/translation"
import type {
  EntryTranslationProgress,
  GeneratedEntryTranslation,
  GenerateEntryTranslationInput,
  TranslateTextInput,
  TranslateTextResult,
  TranslationProviderConfigInput,
  TranslationProviderConfigView,
} from "@suhui/shared"
import type { Session } from "electron"
import { safeStorage, session } from "electron"

import type { StoredTranslationProviderConfig } from "~/lib/store"
import { store } from "~/lib/store"

import type { TranslationTrace } from "./diagnostics"
import { createTranslationTrace, logTranslation, translationErrorKind } from "./diagnostics"
import { splitTranslationParagraph } from "./html"
import type { TranslationProviderRuntimeConfig } from "./provider"
import { translateTexts } from "./provider"
import { ReaderTranslationSession } from "./reader-session"

const DEFAULT_CONFIG: StoredTranslationProviderConfig = {
  provider: "deepl",
  deepl: {
    baseUrl: "https://api-free.deepl.com",
  },
  openAICompatible: {
    baseUrl: "https://api.openai.com/v1",
    model: "",
    apiProtocol: "chat-completions",
  },
}

const SUPPORTED_LANGUAGES = new Set(["en", "ja", "zh-CN", "zh-TW", "fr-FR"])
const TRANSLATION_SESSION_PARTITION_PREFIX = "suhui-translation"
const TRANSLATION_PROXY_BYPASS_RULES = "<local>"

type Fetch = typeof globalThis.fetch

const translationSessions = new Map<string, Promise<Session>>()

const getTranslationSession = () => {
  const proxyUri = store.get("proxy") ?? undefined
  const sessionKey = proxyUri ? createHash("sha256").update(proxyUri).digest("hex") : "system"
  const cachedSession = translationSessions.get(sessionKey)
  if (cachedSession) return cachedSession

  // A proxy configuration gets its own in-memory session. This prevents a proxy change from
  // racing an in-flight request or reusing a connection opened through the previous route.
  const translationSession = session.fromPartition(
    `${TRANSLATION_SESSION_PARTITION_PREFIX}-${sessionKey}`,
    { cache: false },
  )
  const proxyConfig = proxyUri
    ? {
        proxyRules: `${proxyUri},direct://`,
        proxyBypassRules: TRANSLATION_PROXY_BYPASS_RULES,
      }
    : { mode: "system" as const }
  const sessionPromise = translationSession.setProxy(proxyConfig).then(() => translationSession)
  translationSessions.set(sessionKey, sessionPromise)
  void sessionPromise.catch(() => {
    if (translationSessions.get(sessionKey) === sessionPromise) {
      translationSessions.delete(sessionKey)
    }
  })
  return sessionPromise
}

const electronSessionFetch: Fetch = async (input, init) => {
  const translationSession = await getTranslationSession()
  return translationSession.fetch(input instanceof URL ? input.toString() : input, {
    ...init,
    credentials: "omit",
  })
}

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
        apiProtocol: config.openAICompatible.apiProtocol ?? "chat-completions",
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
    apiProtocol: config.openAICompatible.apiProtocol ?? "chat-completions",
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
        apiProtocol: config.openAICompatible.apiProtocol ?? "chat-completions",
      }

type TranslationProgressCallback = (progress: EntryTranslationProgress) => void

class EntryTranslationApplicationService {
  private queues = new Map<string, Promise<GeneratedEntryTranslation>>()
  private readerSessions = new Map<string, ReaderTranslationSession>()
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
    if (
      input.openAICompatible.apiProtocol !== undefined &&
      input.openAICompatible.apiProtocol !== "chat-completions" &&
      input.openAICompatible.apiProtocol !== "responses"
    ) {
      throw new Error("不支持的在线 AI API 协议")
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
          apiProtocol: input.openAICompatible.apiProtocol ?? "chat-completions",
        },
      }
      if (next.provider === "openai-compatible" && !next.openAICompatible.model) {
        throw new Error("在线 AI 模型不能为空")
      }
      await TranslationService.purgeAllForMaintenance()
      store.set("translationProviderConfig", next)
      this.readerSessions.clear()
      return next
    })
    this.configurationBarrier = update.then(
      () => {},
      () => {},
    )
    return toView(await update)
  }

  async testConfig() {
    const translated = await translateTexts(
      runtimeConfig(getStoredConfig()),
      ["Hello"],
      "zh-CN",
      electronSessionFetch,
      createTranslationTrace("config-test"),
    )
    return { translatedText: translated[0] ?? "" }
  }

  async translateText(input: TranslateTextInput): Promise<TranslateTextResult> {
    if (!input?.text?.trim()) throw new Error("待翻译文本不能为空")
    if (input.text.length > 20_000) throw new Error("待翻译文本不能超过 20,000 个字符")
    if (!SUPPORTED_LANGUAGES.has(input.language)) throw new Error("不支持的目标语言")
    const translated = await translateTexts(
      runtimeConfig(getStoredConfig()),
      [input.text],
      input.language,
      electronSessionFetch,
      createTranslationTrace("selection"),
    )
    return { translatedText: translated[0] ?? "" }
  }

  generate(
    input: GenerateEntryTranslationInput,
    onProgress?: TranslationProgressCallback,
  ): Promise<GeneratedEntryTranslation> {
    if (!input?.entryId?.trim()) throw new Error("待翻译文章 ID 不能为空")
    if (
      input.requestId !== undefined &&
      (typeof input.requestId !== "string" ||
        !input.requestId.trim() ||
        input.requestId.length > 128)
    ) {
      throw new Error("翻译 requestId 无效")
    }
    if (!SUPPORTED_LANGUAGES.has(input.language)) throw new Error("不支持的目标语言")
    if (input.target !== "content" && input.target !== "readabilityContent") {
      throw new Error("不支持的翻译正文类型")
    }
    if (
      input.retry &&
      (!input.withContent ||
        typeof input.retry.sessionId !== "string" ||
        !/^[a-f0-9-]{36}$/.test(input.retry.sessionId) ||
        typeof input.retry.batchId !== "string" ||
        !/^(?:title|content|readabilityContent):[1-9]\d*$/.test(input.retry.batchId))
    ) {
      throw new Error("翻译重试参数无效")
    }
    const { configurationBarrier } = this
    const trace: TranslationTrace = {
      ...createTranslationTrace("article", input.entryId),
      target: input.target,
      scope: input.withContent ? "reader" : "list",
    }
    const queuedAt = performance.now()
    logTranslation(trace, "job.queued")
    const key = `${input.entryId}:${input.language}`
    const previous = this.queues.get(key) ?? Promise.resolve(null)
    const job = previous
      .catch(() => null)
      .then(async () => {
        logTranslation(trace, "job.waiting_configuration", {
          queueMs: Math.round(performance.now() - queuedAt),
        })
        await configurationBarrier
        logTranslation(trace, "job.started", {
          queueMs: Math.round(performance.now() - queuedAt),
          proxyMode: store.get("proxy") ? "custom" : "system",
        })
        const result = await this.generateNow(input, onProgress, trace)
        logTranslation(
          trace,
          result.batchState?.failedBatches.length ? "job.partial" : "job.completed",
          {
            elapsedMs: Math.round(performance.now() - queuedAt),
          },
        )
        return result
      })
      .catch((error: unknown) => {
        logTranslation(trace, "job.failed", {
          elapsedMs: Math.round(performance.now() - queuedAt),
          errorKind: translationErrorKind(error),
        })
        if (error instanceof Error && !error.message.includes(trace.traceId)) {
          throw new Error(`${error.message}\n诊断 ID：${trace.traceId}`, { cause: error })
        }
        throw error
      })
      .finally(() => {
        if (this.queues.get(key) === job) this.queues.delete(key)
      })
    this.queues.set(key, job)
    return job
  }

  private async generateNow(
    input: GenerateEntryTranslationInput,
    onProgress?: TranslationProgressCallback,
    trace: TranslationTrace = createTranslationTrace("article", input.entryId),
  ): Promise<GeneratedEntryTranslation> {
    logTranslation(trace, "source.loading")
    const [entry] = await EntryService.getEntryMany([input.entryId])
    if (!entry) throw new Error("待翻译文章不存在")

    const storedConfig = getStoredConfig()
    const currentSourceHash = sourceHash(entry)
    const currentConfigHash = configHash(storedConfig)
    logTranslation(trace, "cache.reading")
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
    if (
      input.withContent &&
      !input.retry &&
      (result.title || !entry.title?.trim()) &&
      (result[input.target] || !entry[input.target]?.trim())
    ) {
      logTranslation(trace, "cache.reused")
      return result
    }
    if (input.withContent) {
      return this.generateReader(
        input,
        result,
        entry,
        currentSourceHash,
        currentConfigHash,
        storedConfig,
        onProgress,
        trace,
      )
    }
    const fields = ["title", "description"] as const
    const needsTextTranslation = fields.some((field) => !result[field] && !!entry[field]?.trim())
    if (!needsTextTranslation) {
      logTranslation(trace, "cache.reused")
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
    const missingTextFields = fields.filter((field) => !result[field] && !!entry[field]?.trim())
    const translateFields = async () => {
      if (missingTextFields.length === 0) return
      for (const field of missingTextFields) {
        const translated: string[] = []
        const parts = entry[field]!.split(/(\r?\n[\t \r]*\n[\t \r\n]*)/u).flatMap(
          splitTranslationParagraph,
        )
        const totalBatches = parts.filter((part) => part.trim()).length
        let batchIndex = 0
        for (const part of parts) {
          if (!part.trim()) {
            translated.push(part)
            continue
          }
          const source = part.trim()
          const textStart = part.indexOf(source)
          const [text] = await translateTexts(
            config,
            [source],
            input.language,
            electronSessionFetch,
            { ...trace, target: field, batchIndex: ++batchIndex, totalBatches },
          )
          translated.push(
            `${part.slice(0, textStart)}${text}${part.slice(textStart + source.length)}`,
          )
        }
        result[field] = translated.join("")
      }
    }
    await translateFields()
    logTranslation(trace, "cache.writing")
    await TranslationService.replaceTranslation({
      ...result,
      sourceHash: currentSourceHash,
      configHash: currentConfigHash,
    })
    return result
  }

  private async generateReader(
    input: GenerateEntryTranslationInput,
    cachedResult: GeneratedEntryTranslation,
    entry: { title?: string | null; content?: string | null; readabilityContent?: string | null },
    currentSourceHash: string,
    currentConfigHash: string,
    storedConfig: StoredTranslationProviderConfig,
    onProgress: TranslationProgressCallback | undefined,
    trace: TranslationTrace,
  ) {
    let checkpoint = input.retry ? this.readerSessions.get(input.retry.sessionId) : undefined
    if (
      input.retry &&
      (!checkpoint ||
        checkpoint.input.entryId !== input.entryId ||
        checkpoint.input.language !== input.language ||
        checkpoint.input.target !== input.target ||
        checkpoint.sourceHash !== currentSourceHash ||
        checkpoint.configHash !== currentConfigHash)
    ) {
      throw new Error("翻译会话已过期或原文/配置已变化，请重新翻译文章")
    }
    checkpoint ??= new ReaderTranslationSession(
      trace.traceId,
      { ...input, retry: undefined },
      currentSourceHash,
      currentConfigHash,
      entry,
      cachedResult,
    )
    // Retain before running so even a cache-write failure cannot lose successful slots.
    this.readerSessions.delete(checkpoint.id)
    this.readerSessions.set(checkpoint.id, checkpoint)
    while (this.readerSessions.size > 16)
      this.readerSessions.delete(this.readerSessions.keys().next().value!)
    const result = await checkpoint.run(
      runtimeConfig(storedConfig),
      electronSessionFetch,
      trace,
      (translation) => {
        if (!input.requestId) return
        onProgress?.({
          requestId: input.requestId,
          entryId: input.entryId,
          language: input.language,
          completedBatches: translation.batchState!.completedBatches,
          totalBatches: translation.batchState!.totalBatches,
          translation,
        })
      },
      input.retry?.batchId,
    )
    if (result.batchState!.failedBatches.length > 0) return result
    logTranslation(trace, "cache.writing")
    const { batchState: _batchState, ...fields } = result
    // The other scope may have completed since this checkpoint was retained.
    const complete = {
      ...cachedResult,
      ...fields,
      description: cachedResult.description,
      [input.target === "content" ? "readabilityContent" : "content"]:
        cachedResult[input.target === "content" ? "readabilityContent" : "content"],
    }
    await TranslationService.replaceTranslation({
      ...complete,
      sourceHash: currentSourceHash,
      configHash: currentConfigHash,
    })
    this.readerSessions.delete(checkpoint.id)
    return complete
  }
}

export const entryTranslationApplicationService = new EntryTranslationApplicationService()
