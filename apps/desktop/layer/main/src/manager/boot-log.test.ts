import { mkdtempSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { describe, expect, it } from "vitest"

import { appendBootLog } from "./boot-log"

describe("boot-log", () => {
  it("追加记录启动阶段与元数据", () => {
    const logsDir = mkdtempSync(join(tmpdir(), "suhui-boot-log-"))
    const logFile = join(logsDir, "boot.log")

    appendBootLog(logFile, "bootstrap:loaded")
    appendBootLog(logFile, "manager:db-ready", { dbType: "postgres", envSource: "none" })

    const content = readFileSync(logFile, "utf8").trim().split("\n")

    expect(content).toHaveLength(2)
    expect(content[0]).toContain("bootstrap:loaded")
    expect(content[1]).toContain("manager:db-ready")
    expect(content[1]).toContain('"dbType":"postgres"')
    expect(content[1]).toContain('"envSource":"none"')
  })
})
