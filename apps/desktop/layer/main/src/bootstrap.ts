import { app } from "electron"
import squirrelStartup from "electron-squirrel-startup"
import { join } from "pathe"

import { DEVICE_ID } from "./constants/system"
import { resolveDbType } from "./manager/db-config"
import { appendBootLog } from "./manager/boot-log"
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
const dbType = resolveDbType(process.env)
appendBootLog(bootLogPath, "bootstrap:env-loaded", {
  activeEnv: envInfo.active ?? "none",
  candidateCount: envInfo.candidates.length,
  dbType,
})
console.info("[main] db_type:", dbType)
console.info("[main] env_source:", envInfo.active ?? "none")
console.info("[main] env_candidates:", envInfo.candidates.length > 0 ? envInfo.candidates : "none")
;(globalThis as any).__followDbType = dbType

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
    })
  })
  .catch((err) => {
    const errorMessage = err instanceof Error ? (err.stack ?? err.message) : String(err)
    appendBootLog(bootLogPath, "bootstrap:manager-import-failed", {
      error: errorMessage,
    })
    console.error("Critical: Failed to import manager/bootstrap:", err)
  })
