import { lookup as dnsLookup } from "node:dns/promises"

type LookupResult = {
  address: string
}

type LookupFn = (hostname: string) => Promise<LookupResult>

export type PreviewDiagnosticsInput = {
  phase: "before" | "after"
  inputUrl: string
  requestedUrl: string
  finalUrl: string
  redirectChain: string[]
  remoteAddress?: string
  remotePort?: number
  lookup?: LookupFn
}

type DnsDiagnostics = {
  host: string | null
  port: number | null
  address: string | null
  error: string | null
}

type ProxyDiagnostics = {
  http: string | null
  https: string | null
  all: string | null
  no: string | null
}

type ConnectionDiagnostics = {
  remoteAddress: string | null
  remotePort: number | null
}

export type PreviewDiagnostics = {
  phase: "before" | "after"
  inputUrl: string
  requestedUrl: string
  finalUrl: string
  redirectChain: string[]
  proxy: ProxyDiagnostics
  dns: DnsDiagnostics
  connection: ConnectionDiagnostics
}

function readEnv(key: string): string | null {
  const value = process.env[key]
  return value && value.trim().length > 0 ? value : null
}

function readProxyEnv(): ProxyDiagnostics {
  return {
    http: readEnv("HTTP_PROXY") ?? readEnv("http_proxy"),
    https: readEnv("HTTPS_PROXY") ?? readEnv("https_proxy"),
    all: readEnv("ALL_PROXY") ?? readEnv("all_proxy"),
    no: readEnv("NO_PROXY") ?? readEnv("no_proxy"),
  }
}

function parseHostPort(url: string): { host: string | null; port: number | null } {
  try {
    const parsed = new URL(url)
    const port =
      parsed.port !== ""
        ? Number(parsed.port)
        : parsed.protocol === "https:"
          ? 443
          : 80
    return { host: parsed.hostname, port }
  } catch {
    return { host: null, port: null }
  }
}

export async function buildPreviewDiagnostics(
  input: PreviewDiagnosticsInput,
): Promise<PreviewDiagnostics> {
  const { host, port } = parseHostPort(input.finalUrl)
  const lookup = input.lookup ?? dnsLookup
  let address: string | null = null
  let error: string | null = null

  if (host) {
    try {
      const result = await lookup(host)
      address = result.address
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  } else {
    error = "Invalid URL host"
  }

  return {
    phase: input.phase,
    inputUrl: input.inputUrl,
    requestedUrl: input.requestedUrl,
    finalUrl: input.finalUrl,
    redirectChain: input.redirectChain,
    proxy: readProxyEnv(),
    dns: {
      host,
      port,
      address,
      error,
    },
    connection: {
      remoteAddress: input.remoteAddress ?? null,
      remotePort: input.remotePort ?? null,
    },
  }
}
