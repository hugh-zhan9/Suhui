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

export type RsshubRuntimeSnapshot = {
  status?: RsshubRuntimeStatus
}

export type RsshubPrecheckClient = {
  getStatus: () => Promise<RsshubRuntimeSnapshot | undefined>
  restart: () => Promise<unknown>
}

export const ensureRsshubRuntimeReady = async (client: RsshubPrecheckClient) => {
  const state = await client.getStatus()
  if (isRsshubRuntimeRunning(state?.status)) {
    return
  }

  await client.restart()
  const stateAfterRestart = await client.getStatus()
  if (!isRsshubRuntimeRunning(stateAfterRestart?.status)) {
    throw toRsshubRuntimeError(stateAfterRestart?.status || state?.status)
  }
}
