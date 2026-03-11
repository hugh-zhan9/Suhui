export type RsshubLocalErrorType =
  | "external_unconfigured"
  | "unavailable"
  | "cooldown"
  | "healthcheck"
  | "route_not_implemented"
  | "none"

export const parseRsshubLocalError = (message: string): RsshubLocalErrorType => {
  if (!message) return "none"

  if (message.includes("RSSHUB_EXTERNAL_UNCONFIGURED")) {
    return "external_unconfigured"
  }
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
  if (message.includes("RSSHUB_ROUTE_NOT_WHITELISTED")) {
    return "route_not_implemented"
  }

  return "none"
}

export const getRsshubLocalErrorTitle = (type: RsshubLocalErrorType) => {
  switch (type) {
    case "external_unconfigured": {
      return "请先配置外部 RSSHub 实例"
    }
    case "unavailable": {
      return "RSSHub 服务当前不可用"
    }
    case "cooldown": {
      return "RSSHub 处于冷却中"
    }
    case "healthcheck": {
      return "RSSHub 启动检查失败"
    }
    case "route_not_implemented": {
      return "RSSHub 暂未实现该路由，请确认路由是否存在或更换实例。"
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
  if (title) return title

  if (rawMessage.toLowerCase().includes("twitter api is not configured")) {
    return "Twitter 路由需要凭据。请在 RSSHub 实例配置 TWITTER_COOKIE 后重启服务。"
  }

  if (
    rawMessage.includes("Could not find Chrome") ||
    rawMessage.toLowerCase().includes("puppeteer browsers install chrome")
  ) {
    return "该 RSSHub 路由依赖浏览器运行环境（Chrome/Puppeteer），当前实例未安装。请改用无需浏览器的路由，或更换 RSSHub 实例。"
  }

  if (
    rawMessage.includes("RSSHUB_OFFICIAL_RUNTIME_ERROR") &&
    rawMessage.toLowerCase().includes("<no response> fetch failed")
  ) {
    const sourceUrl = rawMessage.match(/"(https?:\/\/[^"]+)"/)?.[1]
    const sourceSuffix = sourceUrl ? `源站：${sourceUrl}。` : ""
    return `该 RSSHub 源站当前不可达或拒绝访问（fetch failed）。${sourceSuffix}请稍后重试，或更换可用路由/实例。`
  }

  return rawMessage
}
