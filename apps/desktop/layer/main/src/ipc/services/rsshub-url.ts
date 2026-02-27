export type RsshubStateSnapshot = {
  status: 'stopped' | 'starting' | 'running' | 'error' | 'cooldown'
  port: number | null
  token: string | null
}

export type ResolveRsshubUrlInput = {
  url: string
  state: RsshubStateSnapshot
  customHosts: string[]
}

export const isRsshubUrlLike = (url: string, customHosts: string[]) => {
  try {
    const parsed = new URL(url)
    const normalizedHost = parsed.hostname.toLowerCase()
    const hostMatched =
      normalizedHost === 'rsshub.app' || customHosts.map((i) => i.toLowerCase()).includes(normalizedHost)

    if (hostMatched) return true
    return parsed.protocol === 'rsshub:'
  } catch {
    return false
  }
}

export const resolveRsshubUrl = ({ url, state, customHosts }: ResolveRsshubUrlInput) => {
  let isRsshubUrl = false
  let resolvedPath = ''

  try {
    const parsed = new URL(url)
    const normalizedHost = parsed.hostname.toLowerCase()
    const hostMatched =
      normalizedHost === 'rsshub.app' || customHosts.map((i) => i.toLowerCase()).includes(normalizedHost)

    if (hostMatched) {
      isRsshubUrl = true
      resolvedPath = `${parsed.pathname}${parsed.search}${parsed.hash}`
    } else if (parsed.protocol === 'rsshub:') {
      isRsshubUrl = true
      resolvedPath = `/${parsed.hostname}${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch {
    return { resolvedUrl: url, token: null }
  }

  if (!isRsshubUrl) {
    return { resolvedUrl: url, token: null }
  }

  if (state.status !== 'running' || !state.port) {
    throw new Error('RSSHUB_LOCAL_UNAVAILABLE: 内置 RSSHub 当前未运行')
  }

  return {
    resolvedUrl: `http://127.0.0.1:${state.port}${resolvedPath}`,
    token: state.token,
  }
}
