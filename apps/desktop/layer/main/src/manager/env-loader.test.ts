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
      workspacePath: "/workspace",
    })
    expect(paths).toEqual(["/res/.env", "/workspace/.env", "/user/.env"])
  })

  it("returns active env source and candidates", () => {
    const tmp = fs.mkdtempSync(join(os.tmpdir(), "folo-env-"))
    const resourcesPath = join(tmp, "res")
    const workspacePath = join(tmp, "workspace")
    const userDataPath = join(tmp, "user")
    fs.mkdirSync(resourcesPath, { recursive: true })
    fs.mkdirSync(workspacePath, { recursive: true })
    fs.mkdirSync(userDataPath, { recursive: true })

    const resEnv = join(resourcesPath, ".env")
    const workspaceEnv = join(workspacePath, ".env")
    const userEnv = join(userDataPath, ".env")

    fs.writeFileSync(resEnv, "DB_CONN=127.0.0.1:5432/suhui\n")
    fs.writeFileSync(workspaceEnv, "DB_USER=postgres\n")
    fs.writeFileSync(userEnv, "DB_CONN=127.0.0.1:5432/suhui\n")

    const originalEnv = { ...process.env }
    try {
      const result = loadDesktopEnv({ userDataPath, resourcesPath, workspacePath })
      expect(result.candidates).toEqual([resEnv, workspaceEnv, userEnv])
      expect(result.active).toBe(userEnv)
      expect(process.env.DB_USER).toBe("postgres")
    } finally {
      process.env = originalEnv
    }
  })
})
