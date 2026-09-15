import { createHash, randomUUID } from "node:crypto"

import { logger } from "~/logger"

export type TranslationTrace = {
  traceId: string
  operation: "article" | "selection" | "config-test"
  scope?: "reader" | "list"
  entryRef?: string
  target?: "title" | "description" | "content" | "readabilityContent"
  batchIndex?: number
  totalBatches?: number
}

export const createTranslationTrace = (
  operation: TranslationTrace["operation"],
  entryId?: string,
): TranslationTrace => ({
  traceId: randomUUID(),
  operation,
  ...(entryId ? { entryRef: createHash("sha256").update(entryId).digest("hex").slice(0, 16) } : {}),
})

export const translationErrorKind = (error: unknown) => {
  const name = error instanceof Error ? error.name : ""
  if (name === "TimeoutError") return "timeout"
  if (name === "AbortError") return "aborted"
  if (name === "SyntaxError") return "invalid_json"
  if (name === "TypeError") return "network_or_type_error"
  if (name === "TranslationResponseError") return "invalid_translation"
  return "error"
}

type DiagnosticDetails = {
  elapsedMs?: number
  queueMs?: number
  characters?: number
  textCount?: number
  provider?: "deepl" | "openai-compatible"
  protocol?: "deepl" | "chat-completions" | "responses"
  timeoutMs?: number
  httpStatus?: number
  phase?: "waiting_response" | "reading_response"
  errorKind?: ReturnType<typeof translationErrorKind>
  proxyMode?: "system" | "custom"
  completedBatches?: number
  totalBatches?: number
  outputFormat?: "provider_json" | "text" | "json_array"
  validationIssue?:
    | "invalid_shape"
    | "count_mismatch"
    | "invalid_item"
    | "empty_output"
    | "incomplete_output"
    | "refused_output"
    | "failed_output"
  parseStage?: "response_body" | "translation_json"
  outputCharacters?: number
  completionState?: "complete" | "incomplete" | "unknown"
  expectedCount?: number
  receivedCount?: number
}

// Use the existing rotating main.log. Never pass Error objects, payloads,
// URLs, provider messages, model names or credentials to the log transport.
export const logTranslation = (
  trace: TranslationTrace,
  event: string,
  details: DiagnosticDetails = {},
) => {
  const record = { ...trace, event, ...details }
  try {
    if (event.endsWith("failed")) logger.warn("[translation]", JSON.stringify(record))
    else logger.info("[translation]", JSON.stringify(record))
  } catch {
    // Diagnostics must not interrupt translation or hide the original failure.
  }
}
