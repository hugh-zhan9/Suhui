import type { SupportedActionLanguage, TranslationProviderKind } from "@suhui/shared"

export type TranslationProviderRuntimeConfig = {
  provider: TranslationProviderKind
  baseUrl: string
  apiKey: string
  model?: string
}

type Fetch = typeof globalThis.fetch

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

const providerError = (provider: string, response: Response) =>
  new Error(`${provider} 翻译请求失败（HTTP ${response.status}）`)

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
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw providerError("DeepL", response)
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

const extractJsonObject = (value: string) => {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const candidate = (fenced ?? value).trim()
  try {
    return JSON.parse(candidate) as unknown
  } catch {
    const start = candidate.indexOf("{")
    const end = candidate.lastIndexOf("}")
    if (start < 0 || end <= start) throw new Error("AI 返回的翻译结果不是有效 JSON")
    return JSON.parse(candidate.slice(start, end + 1)) as unknown
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

  const response = await fetchImpl(endpoint(config.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model.trim(),
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            'You translate article text faithfully. Do not add commentary or markup. Preserve every array position. Return only JSON with the shape {"translations":["..."]}.',
        },
        {
          role: "user",
          content: JSON.stringify({ targetLanguage: LANGUAGE_MAP[language], texts }),
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw providerError("在线 AI", response)
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const content = body.choices?.[0]?.message?.content
  if (typeof content !== "string") throw new Error("在线 AI 返回了无效的翻译结果")
  const parsed = extractJsonObject(content) as { translations?: unknown }
  if (
    !Array.isArray(parsed.translations) ||
    parsed.translations.length !== texts.length ||
    parsed.translations.some((item) => typeof item !== "string")
  ) {
    throw new Error("在线 AI 返回的翻译条目数量不匹配")
  }
  return parsed.translations as string[]
}

export const translateTexts = (
  config: TranslationProviderRuntimeConfig,
  texts: string[],
  language: SupportedActionLanguage,
  fetchImpl: Fetch = globalThis.fetch,
) => {
  if (!config.apiKey.trim()) throw new Error("翻译服务 API Key 尚未配置")
  return config.provider === "deepl"
    ? translateWithDeepL(config, texts, language, fetchImpl)
    : translateWithOpenAICompatible(config, texts, language, fetchImpl)
}
