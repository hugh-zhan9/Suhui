export const shouldForwardRendererConsoleError = ({
  level,
  message,
  sourceId,
}: {
  level: number
  message: string
  sourceId?: string
}) => {
  if (level < 2) {
    return false
  }

  if (!message || typeof message !== "string") {
    return false
  }

  const source = sourceId || ""
  if (source.includes("electron-log.js")) {
    return false
  }

  // 防止主进程 logger.error 转发到渲染层后再次被当作 renderer error 回流
  if (message.includes("[Renderer Error]")) {
    return false
  }

  return true
}
