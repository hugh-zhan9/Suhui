import { logger } from "~/logger"

export const DISCOVER_PROXY_BASE_URL = "https://api.folo.is"

const buildDiscoverURL = (path: string, query?: Record<string, unknown>) => {
  const url = new URL(path, DISCOVER_PROXY_BASE_URL)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

export const requestDiscoverJSON = async (
  path: string,
  query?: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
) => {
  const url = buildDiscoverURL(path, query)
  const response = await fetcher(url)

  if (!response.ok) {
    logger.error("[Discover Proxy] request failed", {
      status: response.status,
      url,
    })
    throw new Error(`discover proxy failed: ${response.status} ${response.statusText} ${url}`)
  }

  return await response.json()
}
