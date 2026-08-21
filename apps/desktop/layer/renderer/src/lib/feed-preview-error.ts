export type FeedPreviewErrorType =
  | "not_found"
  | "forbidden"
  | "rate_limited"
  | "server_error"
  | "http_error"
  | "dns"
  | "connection"
  | "timeout"
  | "tls"
  | "redirect"
  | "invalid_feed"
  | "no_feed_discovered"

export type FeedPreviewErrorInfo = {
  type: FeedPreviewErrorType
  /** 面向用户的失败原因 */
  title: string
  /** 面向用户的下一步动作 */
  hint: string
  /** 剥掉内部包装后的原始技术原因，用于诊断展示 */
  detail: string
  /** 实际请求的订阅地址（若能从错误里还原） */
  url?: string
}

/**
 * 本地预览订阅失败时，错误信息会被逐层包装：
 *   IPC:        Error invoking remote method 'db.previewFeed': Error: <inner>
 *   主进程:      [db.previewFeed] failed for <url>: <inner>
 *   renderer:   本地预览订阅失败: <inner>
 * 这里只负责识别这条链路，并把最内层原因翻译成用户能理解的文案。
 */
const PREVIEW_ERROR_MARKERS = [
  "本地预览订阅失败",
  "db.previewFeed",
  // 订阅提交走的是另一条链路，报错口径必须和预览一致
  "db.addFeed",
  "Failed to add feed",
]

const isPreviewErrorMessage = (message: string) =>
  PREVIEW_ERROR_MARKERS.some((marker) => message.includes(marker))

const extractPreviewUrl = (message: string) =>
  message.match(/\[db\.previewFeed\] failed for (\S+):\s/)?.[1]

const WRAPPER_PATTERNS = [
  /^本地预览订阅失败:\s*/,
  /^Error invoking remote method '[^']+':\s*/,
  /^Error:\s*/,
  /^\[db\.previewFeed\] failed for \S+:\s+/,
  /^Failed to add feed:\s*/,
]

const stripPreviewWrappers = (message: string) =>
  WRAPPER_PATTERNS.reduce((reason, pattern) => reason.replace(pattern, "").trim(), message.trim())

const resolveByHttpStatus = (
  status: number,
): Pick<FeedPreviewErrorInfo, "type" | "title" | "hint"> => {
  if (status === 404 || status === 410) {
    return {
      type: "not_found",
      title: `订阅源地址不存在（HTTP ${status}）`,
      hint: "请检查网址是否输入正确，或该订阅源是否已经下线。",
    }
  }
  if (status === 401 || status === 403) {
    return {
      type: "forbidden",
      title: `订阅源拒绝访问（HTTP ${status}）`,
      hint: "该订阅源可能需要登录，或限制了客户端访问。",
    }
  }
  if (status === 429) {
    return {
      type: "rate_limited",
      title: "订阅源限流（HTTP 429）",
      hint: "请稍后重试，或更换一个订阅地址。",
    }
  }
  if (status >= 500) {
    return {
      type: "server_error",
      title: `订阅源服务异常（HTTP ${status}）`,
      hint: "源站暂时不可用，请稍后重试。",
    }
  }
  return {
    type: "http_error",
    title: `订阅源返回错误（HTTP ${status}）`,
    hint: "请检查网址是否输入正确。",
  }
}

const resolveReason = (
  reason: string,
): Pick<FeedPreviewErrorInfo, "type" | "title" | "hint"> | null => {
  const httpStatus = reason.match(/^HTTP (\d{3})$/)?.[1]
  if (httpStatus) {
    return resolveByHttpStatus(Number(httpStatus))
  }

  if (reason.includes("net::ERR_NAME_NOT_RESOLVED")) {
    return {
      type: "dns",
      title: "无法解析该订阅源域名",
      hint: "请检查网址拼写，以及本机网络与 DNS 是否正常。",
    }
  }

  if (reason.includes("net::ERR_CONNECTION_TIMED_OUT") || reason.includes("timed out after")) {
    return {
      type: "timeout",
      title: "请求订阅源超时",
      hint: "源站响应过慢或网络不通，请稍后重试。",
    }
  }

  if (reason.includes("net::ERR_CERT") || reason.includes("net::ERR_SSL")) {
    return {
      type: "tls",
      title: "订阅源证书校验失败",
      hint: "请确认该站点的 HTTPS 证书有效，或改用其他订阅地址。",
    }
  }

  if (reason.includes("net::ERR_")) {
    return {
      type: "connection",
      title: "无法连接到订阅源",
      hint: "请检查网络连接与代理设置后重试。",
    }
  }

  if (reason.includes("Too many redirects") || reason.includes("Redirect loop detected")) {
    return {
      type: "redirect",
      title: "订阅源跳转异常",
      hint: "该地址存在过多跳转或跳转循环，请直接填写最终的订阅地址。",
    }
  }

  // 已经尝试过自动发现与页面抓取，这里不能再提示"请填写订阅地址"
  if (reason.includes("FEED_DISCOVERY_FAILED")) {
    return {
      type: "no_feed_discovered",
      title: "该网页没有可用的订阅源",
      hint: "已尝试自动发现订阅源并从页面生成，均未成功。可改填站点的订阅地址，或改用外部 RSSHub 规则订阅。",
    }
  }

  if (reason.includes("Invalid feed XML") || reason.includes("Unsupported feed format")) {
    return {
      type: "invalid_feed",
      title: "该地址不是有效的 RSS/Atom 订阅源",
      hint: "请确认填写的是订阅地址（常见形式为 /rss.xml、/feed、/atom.xml），而不是网页地址。",
    }
  }

  return null
}

export const parseFeedPreviewError = (message: string): FeedPreviewErrorInfo | null => {
  if (!message || !isPreviewErrorMessage(message)) return null

  const url = extractPreviewUrl(message)
  const detail = stripPreviewWrappers(message)
  const resolved = resolveReason(detail)
  if (!resolved) return null

  return {
    ...resolved,
    detail,
    ...(url ? { url } : {}),
  }
}

export const getFeedPreviewFriendlyMessage = (rawMessage: string) => {
  const info = parseFeedPreviewError(rawMessage)
  if (!info) return rawMessage
  return `${info.title}。${info.hint}`
}
