import type { Session } from "electron"
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

/** Failures Chromium attributes to the proxy hop rather than to the origin. */
const PROXY_HOP_ERROR = /ERR_PROXY_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED/

/** In-memory session for the direct attempt; it must not inherit the system proxy. */
const DIRECT_PARTITION = "suhui-direct-fetch"

const isTransientNetworkError = (error: Error) => TRANSIENT_NETWORK_ERROR.test(error.message)

/**
 * A proxy that accepts the CONNECT tunnel and then drops it mid-handshake surfaces as a
 * plain connection error, so the transient set counts as a suspected proxy failure too.
 */
const isSuspectedProxyFailure = (error: Error) =>
  PROXY_HOP_ERROR.test(error.message) || isTransientNetworkError(error)

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(typeof error === "string" ? error : String(error))

const isRedirectCancelledError = (error: Error) => {
  return error.message.toLowerCase().includes("redirect was cancelled")
}

let directSessionPromise: Promise<Session> | null = null

const getDirectSession = () => {
  directSessionPromise ??= (async () => {
    const directSession = session.fromPartition(DIRECT_PARTITION)
    await directSession.setProxy({ mode: "direct" })
    return directSession
  })()
  return directSessionPromise
}

/** False when the url already leaves the machine directly, so a second route buys nothing. */
const usesProxy = async (url: string) => {
  try {
    const route = await session.defaultSession.resolveProxy(url)
    return !!route && !route.startsWith("DIRECT")
  } catch {
    return false
  }
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
    fetchSession: Session,
  ): Promise<FeedFetchResult> => {
    if (redirectChain.length > maxRedirects) {
      throw new Error("Too many redirects")
    }

    try {
      const response = await fetchWithTimeout(timeoutMs, "Feed request", (controller) =>
        fetchSession.fetch(requestUrl, {
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

        return visit(
          resolvedLocation,
          [...redirectChain, resolvedLocation],
          nextVisited,
          fetchSession,
        )
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
      const normalizedError = toError(error)
      if (redirectChain.length === 0 && isRedirectCancelledError(normalizedError)) {
        try {
          const response = await fetchWithTimeout(timeoutMs, "Feed request", (controller) =>
            fetchSession.fetch(requestUrl, {
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
          const normalizedFallbackError = toError(fallbackError)
          onError?.({ requestUrl, error: normalizedFallbackError })
          throw normalizedFallbackError
        }
      }
      onError?.({ requestUrl, error: normalizedError })
      throw normalizedError
    }
  }

  const fetchThroughSystemRoute = async () => {
    try {
      return await visit(url, [], new Set<string>(), session.defaultSession)
    } catch (error) {
      const normalizedError = toError(error)
      if (!isTransientNetworkError(normalizedError)) throw normalizedError

      await delay(TRANSIENT_RETRY_DELAY_MS)
      return visit(url, [], new Set<string>(), session.defaultSession)
    }
  }

  try {
    return await fetchThroughSystemRoute()
  } catch (error) {
    const routedError = toError(error)
    // A broken proxy hop and a dead source are indistinguishable from the error alone,
    // so a proxied url gets one direct attempt. Timeouts are excluded: they would add
    // another full timeout to every slow source. If the direct attempt fails too, the
    // proxied error is what the feed reports, unchanged.
    if (!isSuspectedProxyFailure(routedError) || !(await usesProxy(url))) throw routedError

    try {
      return await visit(url, [], new Set<string>(), await getDirectSession())
    } catch {
      throw routedError
    }
  }
}
