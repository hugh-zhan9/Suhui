import { appLog } from "~/lib/log"

export function isStartupReadTraceEnabled() {
  return window.__startupReadTraceFlags?.enabled === true
}

export function debugStartupReadTrace(message: string, getData: () => unknown) {
  if (!isStartupReadTraceEnabled()) return
  appLog(message, getData())
}
