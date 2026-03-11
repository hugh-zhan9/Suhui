export type RsshubStateSnapshot = {
  status: "stopped" | "starting" | "running" | "error" | "cooldown"
  port: number | null
  token: string | null
}

export type ResolveRsshubUrlInput = {
  url: string
  customHosts: string[]
  customBaseUrl?: string | null
  allowPublicFallback?: boolean
}

export const isRsshubUrlLike = (url: string, customHosts: string[]) => {
  try {
    const parsed = new URL(url)
    const normalizedHost = parsed.hostname.toLowerCase()
    const hostMatched =
      normalizedHost === "rsshub.app" ||
      customHosts.map((i) => i.toLowerCase()).includes(normalizedHost)

    if (hostMatched) return true
    return parsed.protocol === "rsshub:"
  } catch {
    return false
  }
}

export const shouldUseLocalRsshubRuntime = (url: string, customHosts: string[]) => {
  try {
    const parsed = new URL(url)
    const normalizedHost = parsed.hostname.toLowerCase()
    const normalizedCustomHosts = customHosts.map((i) => i.toLowerCase())
    if (normalizedCustomHosts.includes(normalizedHost)) {
      return false
    }
    return normalizedHost === "rsshub.app" || parsed.protocol === "rsshub:"
  } catch {
    return false
  }
}

const normalizeBaseUrl = (input?: string | null) => {
  const trimmed = input?.trim()
  return trimmed ? trimmed.replace(/\/+$/, "") : ""
}

export const resolveRsshubUrl = ({
  url,
  customHosts,
  customBaseUrl,
  allowPublicFallback = false,
}: ResolveRsshubUrlInput) => {
  let isRsshubUrl = false
  let isCustomRsshubHost = false
  let resolvedPath = ""

  try {
    const parsed = new URL(url)
    const normalizedHost = parsed.hostname.toLowerCase()
    const normalizedCustomHosts = customHosts.map((i) => i.toLowerCase())
    const isOfficialHost = normalizedHost === "rsshub.app"
    isCustomRsshubHost = normalizedCustomHosts.includes(normalizedHost)
    const hostMatched = isOfficialHost || isCustomRsshubHost

    if (hostMatched) {
      isRsshubUrl = true
      resolvedPath = `${parsed.pathname}${parsed.search}${parsed.hash}`
    } else if (parsed.protocol === "rsshub:") {
      isRsshubUrl = true
      resolvedPath = `/${parsed.hostname}${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch {
    return { resolvedUrl: url, token: null }
  }

  if (!isRsshubUrl) {
    return { resolvedUrl: url, token: null }
  }

  if (isCustomRsshubHost) {
    return { resolvedUrl: url, token: null }
  }

  const normalizedCustomBaseUrl = normalizeBaseUrl(customBaseUrl)
  const baseUrl = normalizedCustomBaseUrl || (allowPublicFallback ? "https://rsshub.app" : "")
  if (!baseUrl) {
    throw new Error("RSSHUB_EXTERNAL_UNCONFIGURED: 未配置外部 RSSHub 实例")
  }

  return {
    resolvedUrl: new URL(resolvedPath, baseUrl).toString(),
    token: null,
  }
}
