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
  // true: reader title + target body; false/omitted: list title + description.
  // An empty reader body does not switch the request to list metadata.
  withContent?: boolean
  force?: boolean
  retry?: { sessionId: string; batchId: string }
}

export interface TranslationBatchFailure {
  id: string
  target: "title" | "content" | "readabilityContent"
  batchIndex: number
  error: string
}

export interface TranslationBatchState {
  revision?: number
  sessionId: string
  target: "content" | "readabilityContent"
  completedBatches: number
  totalBatches: number
  failedBatches: TranslationBatchFailure[]
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
  batchState?: TranslationBatchState
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
