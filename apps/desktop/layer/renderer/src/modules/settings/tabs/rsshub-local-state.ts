type RawLocalRsshubStatus = "stopped" | "starting" | "running" | "error" | "cooldown" | "unknown"

export type LocalRsshubState = {
  status: RawLocalRsshubStatus
  port: number | null
  retryCount: number
  cooldownUntil: number | null
}

const VALID_STATUS = new Set<RawLocalRsshubStatus>([
  "stopped",
  "starting",
  "running",
  "error",
  "cooldown",
  "unknown",
])

export const normalizeLocalRsshubState = (
  state?: Partial<LocalRsshubState> | null,
): LocalRsshubState => {
  const status = state?.status
  return {
    status: VALID_STATUS.has((status as RawLocalRsshubStatus) || "unknown")
      ? ((status as RawLocalRsshubStatus) ?? "unknown")
      : "unknown",
    port: typeof state?.port === "number" ? state.port : null,
    retryCount: typeof state?.retryCount === "number" ? state.retryCount : 0,
    cooldownUntil: typeof state?.cooldownUntil === "number" ? state.cooldownUntil : null,
  }
}

export const getLocalRsshubStatusLabel = (state: LocalRsshubState, now = Date.now()) => {
  switch (state.status) {
    case "running": {
      if (state.port) {
        return `运行中（127.0.0.1:${state.port}）`
      }
      return "运行中"
    }
    case "starting": {
      return "启动中"
    }
    case "stopped": {
      return "已停止"
    }
    case "error": {
      return "异常"
    }
    case "cooldown": {
      if (state.cooldownUntil && state.cooldownUntil > now) {
        const remainSeconds = Math.ceil((state.cooldownUntil - now) / 1000)
        return `冷却中（${remainSeconds}秒后自动重试）`
      }
      return "冷却中（等待重试）"
    }
    default: {
      return "未知"
    }
  }
}
