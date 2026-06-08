import { spawn } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

const forgeBin = require.resolve("@electron-forge/cli/dist/electron-forge.js")
const args = process.argv.slice(2)

const env = {
  ...process.env,
  ELECTRON_GET_USE_PROXY: process.env.ELECTRON_GET_USE_PROXY || "1",
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || "https://npmmirror.com/mirrors/electron/",
}

console.error(
  `[run-electron-forge] proxy=${env.ELECTRON_GET_USE_PROXY} mirror=${env.ELECTRON_MIRROR}`,
)

const child = spawn(process.execPath, [forgeBin, ...args], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
})

child.on("error", (error) => {
  console.error("[run-electron-forge] Failed to start electron-forge", error)
  process.exit(1)
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
