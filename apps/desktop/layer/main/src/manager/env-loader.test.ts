import fs from "node:fs"
import os from "node:os"

import { join } from "pathe"
import { describe, expect, it } from "vitest"

import { loadDesktopEnv, resolveEnvPaths } from "./env-loader"

describe("env-loader", () => {
  it("loads resources before userData for override order", () => {
    const paths = resolveEnvPaths({
      userDataPath: "/user",
      resourcesPath: "/res",
    })
    expect(paths).toEqual(["/res/.env", "/user/.env"])
  })

  it("returns active env source and candidates", () => {
    const tmp = fs.mkdtempSync(join(os.tmpdir(), "folo-env-"))
    const resourcesPath = join(tmp, "res")
    const userDataPath = join(tmp, "user")
    fs.mkdirSync(resourcesPath, { recursive: true })
    fs.mkdirSync(userDataPath, { recursive: true })

    const resEnv = join(resourcesPath, ".env")
    const userEnv = join(userDataPath, ".env")

    fs.writeFileSync(resEnv, "DB_TYPE=sqlite\n")
    fs.writeFileSync(userEnv, "DB_TYPE=postgres\n")

    const originalEnv = { ...process.env }
    try {
      const result = loadDesktopEnv({ userDataPath, resourcesPath })
      expect(result.candidates).toEqual([resEnv, userEnv])
      expect(result.active).toBe(userEnv)
    } finally {
      process.env = originalEnv
    }
  })
})
