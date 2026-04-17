import { session } from "electron"

import { resolveHttpErrorMessage } from "./rss-http-error"

export type FeedFetchResult = {
  body: string
  finalUrl: string
  redirectChain: string[]
  statusCode?: number
}

type FeedFetchOptions = {
  rsshubToken?: string | null
  timeoutMs: number
  maxRedirects?: number
  onResponse?: (info: { requestUrl: string; statusCode: number; location: string | null }) => void
  onError?: (info: { requestUrl: string; error: Error }) => void
}

const DEFAULT_MAX_REDIRECTS = 12

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
      }
    } catch (error) {
      const normalizedError =
        error instanceof Error
          ? error
          : new Error(typeof error === "string" ? error : String(error))
      onError?.({ requestUrl, error: normalizedError })
      throw normalizedError
    }
  }

  return visit(url, [], new Set<string>())
}
