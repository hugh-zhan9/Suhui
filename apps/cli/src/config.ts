export const defaultBaseUrl = "http://127.0.0.1:41595"

type BaseUrlEnv = Record<string, string | undefined>

type ResolveBaseUrlOptions = {
  explicitBaseUrl?: string | undefined
  env?: BaseUrlEnv | undefined
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/u, "")

const isHttpProtocol = (protocol: string) => protocol === "http:" || protocol === "https:"

export const resolveBaseUrl = ({
  explicitBaseUrl,
  env = process.env,
}: ResolveBaseUrlOptions = {}): string => {
  const rawValue = explicitBaseUrl?.trim() || env.SUHUI_CLI_BASE_URL?.trim() || defaultBaseUrl

  try {
    const url = new URL(rawValue)
    if (
      !isHttpProtocol(url.protocol) ||
      !url.host ||
      url.pathname.replace(/\/+/gu, "") !== "" ||
      url.search ||
      url.hash
    ) {
      throw new Error("URL must be an HTTP(S) origin")
    }
    return trimTrailingSlash(url.origin)
  } catch {
    throw new Error(`Invalid base URL: ${rawValue}`)
  }
}
