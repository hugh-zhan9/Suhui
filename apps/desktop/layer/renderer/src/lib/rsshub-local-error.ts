export type RsshubLocalErrorType =
  | "unavailable"
  | "cooldown"
  | "healthcheck"
  | "route_not_implemented"
  | "none"

export const parseRsshubLocalError = (message: string): RsshubLocalErrorType => {
  if (!message) return "none"

  if (message.includes("RSSHUB_LOCAL_UNAVAILABLE") || message.includes("内置 RSSHub 当前未运行")) {
    return "unavailable"
  }
  if (message.includes("RSSHub in cooldown") || message.includes("内置 RSSHub 处于冷却中")) {
    return "cooldown"
  }
  if (
    message.includes("RSSHub health check failed") ||
    message.includes("内置 RSSHub 启动检查失败")
  ) {
    return "healthcheck"
  }
  if (message.includes("RSSHUB_ROUTE_NOT_IMPLEMENTED")) {
    return "route_not_implemented"
  }

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
    case "route_not_implemented": {
      return "内置 RSSHub 暂未内置该路由，请先使用普通 RSS 订阅或等待后续版本"
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
