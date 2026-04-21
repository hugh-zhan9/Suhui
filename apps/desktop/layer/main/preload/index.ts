import os from "node:os"
import { platform } from "node:process"

import { electronAPI } from "@electron-toolkit/preload"
import { clipboard, contextBridge } from "electron"

export const isMacOS = platform === "darwin"

export const isWindows = platform === "win32"

export const isLinux = platform === "linux"

/**
 * @see https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information
 * Windows 11 buildNumber starts from 22000.
 */
const detectingWindows11 = () => {
  if (!isWindows) return false

  const release = os.release()
  const majorVersion = Number.parseInt(release.split(".")[0]!)
  const buildNumber = Number.parseInt(release.split(".")[2]!)

  return majorVersion === 10 && buildNumber >= 22000
}

export const isWindows11 = detectingWindows11()

// Custom APIs for renderer
const api = {
  canWindowBlur: process.platform === "darwin" || (process.platform === "win32" && isWindows11),
}

const startupReadTraceFlags = {
  enabled:
    process.argv.includes("--debug-startup-read-trace") ||
    process.argv.includes("--debug-startup-force-wide-read-trace"),
  forceWideRenderMarkRead: process.argv.includes("--debug-startup-force-wide-read-trace"),
  label: process.argv.includes("--debug-startup-force-wide-read-trace")
    ? "force-wide"
    : process.argv.includes("--debug-startup-read-trace")
      ? "default"
      : "off",
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI)
    contextBridge.exposeInMainWorld("api", api)
    contextBridge.exposeInMainWorld("platform", process.platform)
    contextBridge.exposeInMainWorld("__followDbType", "postgres" as "postgres")
    contextBridge.exposeInMainWorld("__startupReadTraceFlags", startupReadTraceFlags)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.platform = process.platform
  // @ts-ignore (define in dts)
  window.__followDbType = "postgres" as "postgres"
  // @ts-ignore (define in dts)
  window.__startupReadTraceFlags = startupReadTraceFlags

  Object.defineProperty(window.navigator, "clipboard", {
    get: () => {
      return clipboard
    },
  })
}
