import type {
  SupportedActionLanguage,
  TranslationApiProtocol,
  TranslationProviderKind,
} from "@suhui/shared"

import type { TranslationTrace } from "./diagnostics"
import { createTranslationTrace, logTranslation, translationErrorKind } from "./diagnostics"

export type TranslationProviderRuntimeConfig = {
  provider: TranslationProviderKind
  baseUrl: string
  apiKey: string
  model?: string
  apiProtocol?: TranslationApiProtocol
}

type Fetch = typeof globalThis.fetch

const REQUEST_TIMEOUT_MS = { deepl: 60_000, "openai-compatible": 120_000 } as const

const LANGUAGE_MAP: Record<SupportedActionLanguage, string> = {
  en: "EN-US",
  ja: "JA",
  "zh-CN": "ZH-HANS",
  "zh-TW": "ZH-HANT",
  "fr-FR": "FR",
}

const endpoint = (baseUrl: string, suffix: string) => {
  const normalized = baseUrl.trim().replace(/\/+$/, "")
  if (!normalized) throw new Error("翻译服务 Base URL 不能为空")
  return normalized.endsWith(suffix) ? normalized : `${normalized}${suffix}`
}

const redactProviderError = (value: string, apiKey: string) => {
  let sanitized = value.replace(/\s+/g, " ").trim()
  if (apiKey) sanitized = sanitized.split(apiKey).join("[REDACTED]")
  return sanitized.replace(/\b(?:sk|key)-[A-Za-z0-9._~+/-]{8,}\b/gi, "[REDACTED]").slice(0, 500)
}

const providerError = async (provider: string, response: Response, apiKey: string) => {
  let detail = ""
  try {
    const body = (await response.clone().json()) as {
      code?: unknown
      message?: unknown
      error?: { code?: unknown; message?: unknown }
    }
    const code = body.error?.code ?? body.code
    const message = body.error?.message ?? body.message
    detail = [code, message]
      .filter((item): item is string => typeof item === "string" && !!item.trim())
      .join(": ")
  } catch {
    // Non-JSON error bodies are intentionally not exposed.
  }
  const safeDetail = redactProviderError(detail, apiKey)
  return new Error(
    `${provider} 翻译请求失败（HTTP ${response.status}）${safeDetail ? `：${safeDetail}` : ""}`,
  )
}

export const translateWithDeepL = async (
  config: TranslationProviderRuntimeConfig,
  texts: string[],
  language: SupportedActionLanguage,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<string[]> => {
  if (texts.length === 0) return []
  const response = await fetchImpl(endpoint(config.baseUrl, "/v2/translate"), {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: texts,
      target_lang: LANGUAGE_MAP[language],
      preserve_formatting: true,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS.deepl),
  })
  if (!response.ok) throw await providerError("DeepL", response, config.apiKey)
  const body = (await response.json()) as { translations?: Array<{ text?: unknown }> }
  const translations = body.translations?.map((item) => item.text)
  if (
    !translations ||
    translations.length !== texts.length ||
    translations.some((item) => typeof item !== "string")
  ) {
    throw new Error("DeepL 返回了无效的翻译结果")
  }
  return translations as string[]
}

class TranslationJsonError extends SyntaxError {
  constructor(
    readonly parseStage: "response_body" | "translation_json",
    readonly outputCharacters?: number,
    readonly completionState?: "complete" | "incomplete" | "unknown",
  ) {
    super(
      parseStage === "response_body"
        ? "在线 AI 的 HTTP 响应不是完整有效的 JSON"
        : "在线 AI 生成的译文不是完整有效的 JSON",
    )
  }
}

const extractJsonObject = (value: string) => {
  // Parse the whole value first: code fences can be literal translation text.
  const candidate = value.trim()
  try {
    return JSON.parse(candidate) as unknown
  } catch {
    const start = candidate.indexOf("{")
    const end = candidate.lastIndexOf("}")
    if (start === -1 || end <= start) throw new SyntaxError("Invalid translation JSON")
    return JSON.parse(candidate.slice(start, end + 1)) as unknown
  }
}

class TranslationResponseError extends Error {
  override name = "TranslationResponseError"

  constructor(
    readonly validationIssue:
      | "invalid_shape"
      | "count_mismatch"
      | "invalid_item"
      | "empty_output"
      | "incomplete_output"
      | "refused_output"
      | "failed_output",
    readonly expectedCount: number,
    readonly receivedCount?: number,
  ) {
    const reason =
      validationIssue === "failed_output"
        ? "在线 AI 报告译文生成失败"
        : validationIssue === "empty_output"
          ? "在线 AI 返回了空译文"
          : validationIssue === "refused_output"
            ? "在线 AI 拒绝生成译文"
            : validationIssue === "incomplete_output"
              ? "在线 AI 报告译文生成未完成"
              : validationIssue === "invalid_shape"
                ? "在线 AI 返回的翻译结果格式无效（需要 translations 数组）"
                : validationIssue === "count_mismatch"
                  ? `在线 AI 返回的翻译条目数量不匹配（预期 ${expectedCount} 条，实际 ${receivedCount} 条）`
                  : "在线 AI 返回的翻译条目类型无效（每条必须是字符串）"
    super(reason)
  }
}

export const translateWithOpenAICompatible = async (
  config: TranslationProviderRuntimeConfig,
  texts: string[],
  language: SupportedActionLanguage,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<string[]> => {
  if (texts.length === 0) return []
  if (!config.model?.trim()) throw new Error("在线 AI 模型不能为空")

  const singleText = texts.length === 1
  const systemPrompt = singleText
    ? [
        "You translate article text faithfully into the requested targetLanguage.",
        "The input contains one text. Return only the translated text itself, without a JSON wrapper, labels, commentary or surrounding code fences.",
        "Preserve punctuation, paragraph breaks and literal code or quotes from the source. Leave text that needs no translation unchanged.",
      ].join(" ")
    : [
        "You translate article text faithfully. Do not add commentary or markup.",
        `The input texts array contains exactly ${texts.length} items. Return a translations array containing exactly ${texts.length} strings in the same order.`,
        "Each output at index i must translate only texts[i]. Neighboring items may be fragments of the same paragraph separated by inline formatting; use them as context but never merge, split, reorder or omit array items.",
        "Keep punctuation-only items, empty strings and text that needs no translation in their original positions.",
        'Return only one JSON object with the key "translations". Check the array length and that every item is a string before responding.',
      ].join(" ")
  const userPrompt = JSON.stringify({
    targetLanguage: LANGUAGE_MAP[language],
    ...(singleText ? { text: texts[0] } : { texts }),
  })
  const useResponses = config.apiProtocol === "responses"
  const response = await fetchImpl(
    endpoint(config.baseUrl, useResponses ? "/responses" : "/chat/completions"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        useResponses
          ? { model: config.model.trim(), instructions: systemPrompt, input: userPrompt }
          : {
              model: config.model.trim(),
              temperature: 0,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
            },
      ),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS["openai-compatible"]),
    },
  )
  if (!response.ok) throw await providerError("在线 AI", response, config.apiKey)
  const body = (await response.json().catch((error: unknown) => {
    if (error instanceof SyntaxError) throw new TranslationJsonError("response_body")
    throw error
  })) as {
    status?: unknown
    choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown; refusal?: unknown } }>
    output_text?: unknown
    output?: Array<{ content?: Array<{ type?: unknown; text?: unknown }> }>
  }
  const refused = useResponses
    ? body.output?.some((item) => item.content?.some((part) => part.type === "refusal"))
    : body.choices?.[0]?.finish_reason === "content_filter" ||
      (typeof body.choices?.[0]?.message?.refusal === "string" &&
        !!body.choices[0].message.refusal.trim())
  if (refused) throw new TranslationResponseError("refused_output", texts.length)
  const responseOutput = body.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("")
  const content = useResponses
    ? typeof body.output_text === "string"
      ? body.output_text
      : responseOutput
    : body.choices?.[0]?.message?.content
  if (typeof content !== "string") throw new Error("在线 AI 返回了无效的翻译结果")
  if (useResponses && (body.status === "failed" || body.status === "cancelled")) {
    throw new TranslationResponseError("failed_output", texts.length)
  }
  const completionState = useResponses
    ? typeof body.status === "string" &&
      ["incomplete", "in_progress", "queued"].includes(body.status)
      ? "incomplete"
      : body.status === "completed"
        ? "complete"
        : "unknown"
    : body.choices?.[0]?.finish_reason === "length"
      ? "incomplete"
      : body.choices?.[0]?.finish_reason === "stop"
        ? "complete"
        : "unknown"
  if (completionState === "incomplete") {
    throw new TranslationResponseError("incomplete_output", texts.length)
  }
  if (singleText) {
    if (texts[0]!.trim() && !content.trim()) {
      throw new TranslationResponseError("empty_output", 1)
    }
    // A single result has no slot ambiguity. Do not make its punctuation obey JSON syntax.
    return [content]
  }
  let parsed: unknown
  try {
    parsed = extractJsonObject(content)
  } catch {
    throw new TranslationJsonError("translation_json", content.length, completionState)
  }
  if (!parsed || typeof parsed !== "object" || !("translations" in parsed)) {
    throw new TranslationResponseError("invalid_shape", texts.length)
  }
  const { translations } = parsed
  if (!Array.isArray(translations)) {
    throw new TranslationResponseError("invalid_shape", texts.length)
  }
  if (translations.length !== texts.length) {
    throw new TranslationResponseError("count_mismatch", texts.length, translations.length)
  }
  if (translations.some((item) => typeof item !== "string")) {
    throw new TranslationResponseError("invalid_item", texts.length, translations.length)
  }
  return translations as string[]
}

export const translateTexts = async (
  config: TranslationProviderRuntimeConfig,
  texts: string[],
  language: SupportedActionLanguage,
  fetchImpl: Fetch = globalThis.fetch,
  trace: TranslationTrace = createTranslationTrace("selection"),
) => {
  if (!config.apiKey.trim()) throw new Error("翻译服务 API Key 尚未配置")
  if (texts.length === 0) return []
  const started = performance.now()
  const timeoutMs = REQUEST_TIMEOUT_MS[config.provider]
  const details = {
    provider: config.provider,
    protocol:
      config.provider === "deepl"
        ? ("deepl" as const)
        : (config.apiProtocol ?? ("chat-completions" as const)),
    characters: texts.reduce((total, text) => total + text.length, 0),
    textCount: texts.length,
    timeoutMs,
    outputFormat:
      config.provider === "deepl"
        ? ("provider_json" as const)
        : texts.length === 1
          ? ("text" as const)
          : ("json_array" as const),
  }
  let phase: "waiting_response" | "reading_response" = "waiting_response"
  let httpStatus: number | undefined
  logTranslation(trace, "request.started", details)
  const tracedFetch: Fetch = async (input, init) => {
    const response = await fetchImpl(input, init)
    phase = "reading_response"
    httpStatus = response.status
    logTranslation(trace, "request.headers", {
      ...details,
      httpStatus,
      elapsedMs: Math.round(performance.now() - started),
    })
    return response
  }
  try {
    const result = await (config.provider === "deepl"
      ? translateWithDeepL(config, texts, language, tracedFetch)
      : translateWithOpenAICompatible(config, texts, language, tracedFetch))
    logTranslation(trace, "request.completed", {
      ...details,
      httpStatus,
      elapsedMs: Math.round(performance.now() - started),
    })
    return result
  } catch (error) {
    const errorKind = translationErrorKind(error)
    logTranslation(trace, "request.failed", {
      ...details,
      phase,
      httpStatus,
      errorKind,
      elapsedMs: Math.round(performance.now() - started),
      ...(error instanceof TranslationJsonError
        ? {
            parseStage: error.parseStage,
            outputCharacters: error.outputCharacters,
            completionState: error.completionState,
          }
        : {}),
      ...(error instanceof TranslationResponseError
        ? {
            validationIssue: error.validationIssue,
            expectedCount: error.expectedCount,
            receivedCount: error.receivedCount,
          }
        : {}),
    })
    if (errorKind === "timeout") {
      const target =
        trace.target === "title"
          ? "标题"
          : trace.target === "description"
            ? "摘要"
            : trace.operation === "selection"
              ? "选区"
              : trace.operation === "config-test"
                ? "测试文本"
                : "正文"
      const batch = trace.batchIndex ? `第 ${trace.batchIndex}/${trace.totalBatches} 批，` : ""
      const detail = phase === "waiting_response" ? "尚未收到响应头" : "读取响应结果时超时"
      const timeout = new Error(
        `${target}翻译超时（${timeoutMs / 1000} 秒，${batch}${details.characters} 字符；${detail}）。诊断 ID：${trace.traceId}`,
        { cause: error },
      )
      timeout.name = "TimeoutError"
      throw timeout
    }
    throw error
  }
}
