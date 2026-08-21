import { app } from "electron"
import squirrelStartup from "electron-squirrel-startup"
import { join } from "pathe"

import { DEVICE_ID } from "./constants/system"
import { appendBootLog } from "./manager/boot-log"
import { resolveDbType } from "./manager/db-config"
import { loadDesktopEnv } from "./manager/env-loader"

const bootLogPath = join(app.getPath("logs"), "boot.log")

appendBootLog(bootLogPath, "bootstrap:loaded", {
  pid: process.pid,
  resourcesPath: process.resourcesPath,
})

console.info("[main] device id:", DEVICE_ID)
if (squirrelStartup) {
  appendBootLog(bootLogPath, "bootstrap:squirrel-startup")
  app.quit()
}

const envInfo = loadDesktopEnv({
  userDataPath: app.getPath("userData"),
  resourcesPath: process.resourcesPath,
  workspacePath: process.cwd(),
})
// 这里只反映**环境变量**推导出的方言：持久化的 override（例如转换到 SQLite 之后）
// 要到 DBManager 初始化才生效，所以字段名必须写清楚，否则排查时会看错库。
const envDbType = resolveDbType(process.env)
appendBootLog(bootLogPath, "bootstrap:env-loaded", {
  activeEnv: envInfo.active ?? "none",
  candidateCount: envInfo.candidates.length,
  envDbType,
})
console.info("[main] env_db_type:", envDbType)
console.info("[main] env_source:", envInfo.active ?? "none")
console.info("[main] env_candidates:", envInfo.candidates.length > 0 ? envInfo.candidates : "none")
;(globalThis as any).__followDbType = envDbType

appendBootLog(bootLogPath, "bootstrap:before-manager-import")
import("./manager/bootstrap")
  .then(({ BootstrapManager }) => {
    appendBootLog(bootLogPath, "bootstrap:manager-imported")
    BootstrapManager.start().catch((err) => {
      const errorMessage = err instanceof Error ? (err.stack ?? err.message) : String(err)
      appendBootLog(bootLogPath, "bootstrap:start-failed", {
        error: errorMessage,
      })
      console.error("Failed to start BootstrapManager:", err)
      app.exit(1)
    })
  })
  .catch((err) => {
    const errorMessage = err instanceof Error ? (err.stack ?? err.message) : String(err)
    appendBootLog(bootLogPath, "bootstrap:manager-import-failed", {
      error: errorMessage,
    })
    console.error("Critical: Failed to import manager/bootstrap:", err)
  })
