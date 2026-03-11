import { extractRsshubCustomHosts } from "./rsshub-custom-host"
import { resolveRsshubUrl } from "./rsshub-url"

export type ResolvePreviewFeedUrlOptions = {
  customBaseUrl?: string | null
  allowPublicFallback?: boolean
}

export const resolvePreviewFeedUrl = (
  url: string,
  { customBaseUrl, allowPublicFallback }: ResolvePreviewFeedUrlOptions = {},
) => {
  const baseUrl = customBaseUrl ?? ""
  const customHosts = extractRsshubCustomHosts(baseUrl)
  const { resolvedUrl } = resolveRsshubUrl({
    url,
    customHosts,
    customBaseUrl: baseUrl,
    allowPublicFallback,
  })
  return resolvedUrl
}
