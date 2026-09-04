import type { SupportedActionLanguage } from "./language"

export type TranslationProviderKind = "deepl" | "openai-compatible"
export type TranslationApiProtocol = "chat-completions" | "responses"

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
    apiProtocol: TranslationApiProtocol
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
    apiProtocol?: TranslationApiProtocol
  }
}

export interface GenerateEntryTranslationInput {
  requestId?: string
  entryId: string
  language: SupportedActionLanguage
  target: "content" | "readabilityContent"
  withContent?: boolean
}

export interface EntryTranslationProgress {
  requestId: string
  entryId: string
  language: SupportedActionLanguage
  completedBatches: number
  totalBatches: number
  translation: GeneratedEntryTranslation
}

export const TRANSLATION_PROGRESS_CHANNEL = "translation.progress"

export interface GeneratedEntryTranslation {
  entryId: string
  language: SupportedActionLanguage
  title: string | null
  description: string | null
  content: string | null
  readabilityContent: string | null
}

export interface TranslateTextInput {
  text: string
  language: SupportedActionLanguage
}

export interface TranslateTextResult {
  translatedText: string
}
