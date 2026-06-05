export const defaultBaseUrl = "http://127.0.0.1:41595"

type BaseUrlEnv = Record<string, string | undefined>

type ResolveBaseUrlOptions = {
  explicitBaseUrl?: string | undefined
  env?: BaseUrlEnv | undefined
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/u, "")

export const resolveBaseUrl = ({
  explicitBaseUrl,
  env = process.env,
}: ResolveBaseUrlOptions = {}): string => {
  const rawValue = explicitBaseUrl?.trim() || env.SUHUI_CLI_BASE_URL?.trim() || defaultBaseUrl

  try {
    const url = new URL(rawValue)
    if (!url.protocol || !url.host) {
      throw new Error("URL must include protocol and host")
    }
    return trimTrailingSlash(url.toString())
  } catch {
    throw new Error(`Invalid base URL: ${rawValue}`)
  }
}
