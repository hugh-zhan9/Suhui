import { appendFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

function stringifyMeta(meta?: Record<string, unknown>) {
  if (!meta || Object.keys(meta).length === 0) {
    return ""
  }

  try {
    return ` ${JSON.stringify(meta)}`
  } catch {
    return ' {"meta":"[unserializable]"}'
  }
}

export function appendBootLog(filePath: string, stage: string, meta?: Record<string, unknown>) {
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    appendFileSync(filePath, `${new Date().toISOString()} ${stage}${stringifyMeta(meta)}\n`, "utf8")
  } catch {
    // 启动诊断日志不能反向阻断应用启动。
  }
}
