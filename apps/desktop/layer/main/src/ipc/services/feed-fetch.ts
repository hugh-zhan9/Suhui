import { session } from "electron"

import { resolveHttpErrorMessage } from "./rss-http-error"

export type FeedFetchResult = {
  body: string
  finalUrl: string
  redirectChain: string[]
  statusCode?: number
  contentType?: string
}

type FeedFetchOptions = {
  rsshubToken?: string | null
  timeoutMs: number
  maxRedirects?: number
  onResponse?: (info: { requestUrl: string; statusCode: number; location: string | null }) => void
  onError?: (info: { requestUrl: string; error: Error }) => void
}

const DEFAULT_MAX_REDIRECTS = 12
/** One extra attempt for connection-level flakiness. */
const TRANSIENT_RETRY_DELAY_MS = 500

/**
 * Connection-level failures that a second attempt usually clears. HTTP statuses,
 * timeouts and name-resolution failures are deliberately excluded: retrying them
 * only doubles the wait or repeats a permanent error.
 */
const TRANSIENT_NETWORK_ERROR =
  /ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_SOCKET_NOT_CONNECTED|ERR_CONNECTION_ABORTED/

const isTransientNetworkError = (error: Error) => TRANSIENT_NETWORK_ERROR.test(error.message)

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isRedirectCancelledError = (error: Error) => {
  return error.message.toLowerCase().includes("redirect was cancelled")
}

const createHeaders = (rsshubToken?: string | null) => {
  const headers = new Headers({
    // Request header values must stay ASCII-safe.
    "User-Agent": "Suhui-RSS-Reader/1.0",
    Accept: "application/rss+xml, application/atom+xml, application/xml, */*",
  })

  if (rsshubToken) {
    headers.set("X-RSSHub-Token", rsshubToken)
  }

  return headers
}

async function fetchWithTimeout<T>(
  timeoutMs: number,
  label: string,
  factory: (controller: AbortController) => Promise<T>,
) {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error(`${label} timed out after ${timeoutMs}ms`))
  }, timeoutMs)

  try {
    return await factory(controller)
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchFeedUrl(
  url: string,
  {
    rsshubToken,
    timeoutMs,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    onResponse,
    onError,
  }: FeedFetchOptions,
): Promise<FeedFetchResult> {
  const headers = createHeaders(rsshubToken)

  const visit = async (
    requestUrl: string,
    redirectChain: string[],
    redirectVisited: Set<string>,
  ): Promise<FeedFetchResult> => {
    if (redirectChain.length > maxRedirects) {
      throw new Error("Too many redirects")
    }

    try {
      const response = await fetchWithTimeout(timeoutMs, "Feed request", (controller) =>
        session.defaultSession.fetch(requestUrl, {
          headers,
          redirect: "manual",
          signal: controller.signal,
        }),
      )

      onResponse?.({
        requestUrl,
        statusCode: response.status,
        location: response.headers.get("location"),
      })

      if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
        const resolvedLocation = new URL(response.headers.get("location")!, requestUrl).toString()
        if (redirectVisited.has(resolvedLocation)) {
          throw new Error(`Redirect loop detected: ${resolvedLocation}`)
        }

        const nextVisited = new Set(redirectVisited)
        nextVisited.add(resolvedLocation)

        return visit(resolvedLocation, [...redirectChain, resolvedLocation], nextVisited)
      }

      if (response.status >= 400) {
        const body = await response.text()
        throw new Error(resolveHttpErrorMessage(response.status, body))
      }

      return {
        body: await response.text(),
        finalUrl: response.url || requestUrl,
        redirectChain,
        statusCode: response.status,
        contentType: response.headers.get("content-type") ?? undefined,
      }
    } catch (error) {
      const normalizedError =
        error instanceof Error
          ? error
          : new Error(typeof error === "string" ? error : String(error))
      if (redirectChain.length === 0 && isRedirectCancelledError(normalizedError)) {
        try {
          const response = await fetchWithTimeout(timeoutMs, "Feed request", (controller) =>
            session.defaultSession.fetch(requestUrl, {
              headers,
              redirect: "follow",
              signal: controller.signal,
            }),
          )

          onResponse?.({
            requestUrl,
            statusCode: response.status,
            location: response.headers.get("location"),
          })

          if (response.status >= 400) {
            const body = await response.text()
            throw new Error(resolveHttpErrorMessage(response.status, body))
          }

          const finalUrl = response.url || requestUrl
          return {
            body: await response.text(),
            finalUrl,
            redirectChain: finalUrl !== requestUrl ? [finalUrl] : [],
            statusCode: response.status,
            contentType: response.headers.get("content-type") ?? undefined,
          }
        } catch (fallbackError) {
          const normalizedFallbackError =
            fallbackError instanceof Error
              ? fallbackError
              : new Error(typeof fallbackError === "string" ? fallbackError : String(fallbackError))
          onError?.({ requestUrl, error: normalizedFallbackError })
          throw normalizedFallbackError
        }
      }
      onError?.({ requestUrl, error: normalizedError })
      throw normalizedError
    }
  }

  try {
    return await visit(url, [], new Set<string>())
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error))
    if (!isTransientNetworkError(normalizedError)) throw normalizedError

    await delay(TRANSIENT_RETRY_DELAY_MS)
    return visit(url, [], new Set<string>())
  }
}
