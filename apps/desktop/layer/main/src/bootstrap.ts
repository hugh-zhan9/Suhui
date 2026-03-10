import { app } from "electron"
import squirrelStartup from "electron-squirrel-startup"

import { DEVICE_ID } from "./constants/system"
import { resolveDbType } from "./manager/db-config"
import { loadDesktopEnv } from "./manager/env-loader"

console.info("[main] device id:", DEVICE_ID)
if (squirrelStartup) {
  app.quit()
}

loadDesktopEnv({
  userDataPath: app.getPath("userData"),
  resourcesPath: process.resourcesPath,
})
;(globalThis as any).__followDbType = resolveDbType(process.env)

import("./manager/bootstrap").then(({ BootstrapManager }) => {
  BootstrapManager.start().catch((err) => {
    console.error("Failed to start BootstrapManager:", err)
  })
})
