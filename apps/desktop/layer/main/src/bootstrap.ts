import { app } from "electron"
import squirrelStartup from "electron-squirrel-startup"

import { DEVICE_ID } from "./constants/system"
import { resolveDbType } from "./manager/db-config"
import { loadDesktopEnv } from "./manager/env-loader"

console.info("[main] device id:", DEVICE_ID)
if (squirrelStartup) {
  app.quit()
}

const envInfo = loadDesktopEnv({
  userDataPath: app.getPath("userData"),
  resourcesPath: process.resourcesPath,
})
const dbType = resolveDbType(process.env)
console.info("[main] db_type:", dbType)
console.info("[main] env_source:", envInfo.active ?? "none")
console.info("[main] env_candidates:", envInfo.candidates.length > 0 ? envInfo.candidates : "none")
;(globalThis as any).__followDbType = dbType

import("./manager/bootstrap").then(({ BootstrapManager }) => {
  BootstrapManager.start().catch((err) => {
    console.error("Failed to start BootstrapManager:", err)
  })
})
