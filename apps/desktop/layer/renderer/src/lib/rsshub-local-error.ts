export type RsshubLocalErrorType = "unavailable" | "cooldown" | "healthcheck" | "none"

export const parseRsshubLocalError = (message: string): RsshubLocalErrorType => {
  if (!message) return "none"

  if (message.includes("RSSHUB_LOCAL_UNAVAILABLE")) return "unavailable"
  if (message.includes("RSSHub in cooldown")) return "cooldown"
  if (message.includes("RSSHub health check failed")) return "healthcheck"

  return "none"
}

export const getRsshubLocalErrorTitle = (type: RsshubLocalErrorType) => {
  switch (type) {
    case "unavailable": {
      return "内置 RSSHub 当前未运行"
    }
    case "cooldown": {
      return "内置 RSSHub 处于冷却中"
    }
    case "healthcheck": {
      return "内置 RSSHub 启动检查失败"
    }
    default: {
      return ""
    }
  }
}

export const shouldShowRsshubRestartAction = (type: RsshubLocalErrorType) =>
  type === "unavailable" || type === "cooldown" || type === "healthcheck"

export const getRsshubFriendlyMessage = (rawMessage: string) => {
  const type = parseRsshubLocalError(rawMessage)
  const title = getRsshubLocalErrorTitle(type)
  return title || rawMessage
}
