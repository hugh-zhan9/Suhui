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
  if (message.includes("RSSHUB_ROUTE_NOT_WHITELISTED")) {
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
  if (title) return title

  if (rawMessage.toLowerCase().includes("twitter api is not configured")) {
    return "Twitter 路由需要凭据。请在 RSSHub 控制台配置 TWITTER_COOKIE 后重启内置 RSSHub。"
  }

  if (
    rawMessage.includes("Could not find Chrome") ||
    rawMessage.toLowerCase().includes("puppeteer browsers install chrome")
  ) {
    return "该 RSSHub 路由依赖浏览器运行环境（Chrome/Puppeteer），当前内置环境未安装。请改用无需浏览器的路由，或切换自定义 RSSHub 实例。"
  }

  if (
    rawMessage.includes("RSSHUB_OFFICIAL_RUNTIME_ERROR") &&
    rawMessage.toLowerCase().includes("<no response> fetch failed")
  ) {
    const sourceUrl = rawMessage.match(/\"(https?:\/\/[^\"]+)\"/)?.[1]
    const sourceSuffix = sourceUrl ? `源站：${sourceUrl}。` : ""
    return `该 RSSHub 源站当前不可达或拒绝访问（fetch failed）。${sourceSuffix}请稍后重试，或更换可用路由/自定义 RSSHub 实例。`
  }

  return rawMessage
}
