import { exitCodes, type AgentErrorBody, type ExitCode } from "./types.js"

type FetchImplementation = typeof fetch

type FetchAgentJsonOptions = {
  method?: string | undefined
  body?: unknown
  timeoutMs?: number | undefined
  fetchImpl?: FetchImplementation | undefined
}

export class SuhuiCliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode: ExitCode,
  ) {
    super(message)
    this.name = "SuhuiCliError"
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isFailureEnvelope = (value: unknown): value is AgentErrorBody => {
  if (!isRecord(value) || !isRecord(value.error)) return false
  return typeof value.error.code === "string" && typeof value.error.message === "string"
}

const hasSuccessEnvelope = (value: unknown): value is { data: unknown } =>
  isRecord(value) && "data" in value

const mapApiErrorExitCode = (status: number, code: string): ExitCode => {
  if (status === 404 || code === "SUHUI_ENTRY_NOT_FOUND") return exitCodes.notFound
  return exitCodes.error
}

const isUnavailableError = (error: unknown) => {
  if (error instanceof SuhuiCliError) return false
  if (error instanceof Error && error.name === "AbortError") return true
  if (error instanceof TypeError) return true
  return false
}

const createRequestUrl = (baseUrl: string, path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedPath}`
}

export const fetchAgentJson = async <T = unknown>(
  baseUrl: string,
  path: string,
  { method = "GET", body, timeoutMs = 10_000, fetchImpl = fetch }: FetchAgentJsonOptions = {},
): Promise<T> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const url = createRequestUrl(baseUrl, path)

  try {
    const response = await fetchImpl(url, {
      method,
      signal: controller.signal,
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
          }),
    })

    const parsed = (await response.json().catch(() => null)) as unknown

    if (response.ok && hasSuccessEnvelope(parsed)) {
      return parsed.data as T
    }

    if (isFailureEnvelope(parsed)) {
      throw new SuhuiCliError(
        parsed.error.code,
        parsed.error.message,
        mapApiErrorExitCode(response.status, parsed.error.code),
      )
    }

    throw new SuhuiCliError(
      "SUHUI_UNEXPECTED_RESPONSE",
      "Suhui remote API returned an unexpected response shape",
      exitCodes.unexpectedResponse,
    )
  } catch (error) {
    if (error instanceof SuhuiCliError) throw error
    if (isUnavailableError(error)) {
      throw new SuhuiCliError(
        "SUHUI_REMOTE_UNAVAILABLE",
        `Cannot connect to Suhui remote API at ${baseUrl}`,
        exitCodes.remoteUnavailable,
      )
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
