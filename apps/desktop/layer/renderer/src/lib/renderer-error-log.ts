type RendererErrorInput = {
  message?: string
  filename?: string
  lineno?: number
  colno?: number
  error?: { stack?: string; message?: string } | null
}

type RendererRejectionInput = {
  reason?: unknown
}

export type RendererErrorPayload = {
  type: "window-error" | "unhandled-rejection"
  message: string
  location?: string
  stack?: string
}

const stringifyUnknown = (value: unknown) => {
  if (typeof value === "string") return value
  if (value instanceof Error) return value.message
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const buildRendererErrorPayload = (input: RendererErrorInput): RendererErrorPayload => {
  const file = input.filename || "unknown"
  const line = input.lineno ?? 0
  const col = input.colno ?? 0
  return {
    type: "window-error",
    message: input.message || input.error?.message || "Unknown renderer error",
    location: `${file}:${line}:${col}`,
    stack: input.error?.stack,
  }
}

export const buildRendererRejectionPayload = (
  input: RendererRejectionInput,
): RendererErrorPayload => {
  const { reason } = input
  const message = stringifyUnknown(reason) || "Unhandled rejection"
  return {
    type: "unhandled-rejection",
    message,
    stack: reason instanceof Error ? reason.stack : undefined,
  }
}
