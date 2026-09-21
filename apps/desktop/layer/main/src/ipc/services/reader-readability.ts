import { randomUUID } from "node:crypto"

import { readability } from "@suhui/readability"

import { logger } from "~/logger"

// Error messages/stacks may contain URL credentials, response text or article HTML.
// Retain only known error names and system codes, including nested fetch causes.
export function readabilityErrorDetails(error: unknown) {
  const names = new Set<string>()
  const codes = new Set<string>()
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || depth > 3) return
    const item = value as { name?: unknown; code?: unknown; cause?: unknown; errors?: unknown }
    if (
      typeof item.name === "string" &&
      /^(?:Error|TypeError|SyntaxError|RangeError|AggregateError|AbortError|TimeoutError)$/.test(
        item.name,
      )
    )
      names.add(item.name)
    if (
      typeof item.code === "string" &&
      /^(?:E[A-Z0-9_]{2,40}|UND_ERR_[A-Z_]{1,40}|ERR_[A-Z_]{1,40}|CERT_[A-Z_]{1,40}|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE)$/.test(
        item.code,
      )
    )
      codes.add(item.code)
    visit(item.cause, depth + 1)
    if (Array.isArray(item.errors)) item.errors.slice(0, 8).forEach((e) => visit(e, depth + 1))
  }
  visit(error, 0)
  return { errorNames: [...names], errorCodes: [...codes] }
}

export async function readArticleWithDiagnostics(url: string, entryId?: string) {
  const traceId = randomUUID()
  const started = Date.now()
  let phase = "request"
  let httpStatus: number | undefined
  try {
    return await readability(url, (event) => {
      const failed = "error" in event
      phase = event.phase
      httpStatus = event.httpStatus ?? httpStatus
      const record = {
        traceId,
        entryId,
        phase,
        event: failed ? "failed" : event.phase,
        elapsedMs: Date.now() - started,
        httpStatus,
        characters: event.characters,
        ...(failed ? readabilityErrorDetails(event.error) : {}),
      }
      const log = failed ? logger.warn : logger.info
      log("[readability]", JSON.stringify(record))
    })
  } catch (error) {
    const details = readabilityErrorDetails(error)
    const reason = [...details.errorNames, ...details.errorCodes].join(" / ") || "Error"
    // electron-ipc-decorator logs the thrown Error, including its cause. Do not
    // attach the original exception after extracting safe diagnostic fields.
    throw new Error(`READABILITY_FAILED phase=${phase} reason=${reason} traceId=${traceId}`)
  }
}
