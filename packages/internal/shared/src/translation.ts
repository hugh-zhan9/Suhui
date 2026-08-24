import type { SupportedActionLanguage } from "./language"

export type TranslationProviderKind = "deepl" | "openai-compatible"

export interface TranslationProviderConfigView {
  provider: TranslationProviderKind
  deepl: {
    baseUrl: string
    hasApiKey: boolean
  }
  openAICompatible: {
    baseUrl: string
    hasApiKey: boolean
    model: string
  }
}

export interface TranslationProviderConfigInput {
  provider: TranslationProviderKind
  deepl: {
    baseUrl: string
    apiKey?: string
  }
  openAICompatible: {
    baseUrl: string
    apiKey?: string
    model: string
  }
}

export interface GenerateEntryTranslationInput {
  entryId: string
  language: SupportedActionLanguage
  target: "content" | "readabilityContent"
  withContent?: boolean
}

export interface GeneratedEntryTranslation {
  entryId: string
  language: SupportedActionLanguage
  title: string | null
  description: string | null
  content: string | null
  readabilityContent: string | null
}
