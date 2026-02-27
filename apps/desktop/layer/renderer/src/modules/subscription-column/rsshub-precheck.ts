export type RsshubRuntimeStatus =
  | "stopped"
  | "starting"
  | "running"
  | "error"
  | "cooldown"
  | "unknown"
  | null
  | undefined

export const isRsshubRuntimeRunning = (status: RsshubRuntimeStatus) => status === "running"

export const toRsshubRuntimeError = (status: RsshubRuntimeStatus) => {
  if (status === "cooldown") {
    return new Error("RSSHub in cooldown")
  }
  return new Error("RSSHUB_LOCAL_UNAVAILABLE: 内置 RSSHub 当前未运行")
}
