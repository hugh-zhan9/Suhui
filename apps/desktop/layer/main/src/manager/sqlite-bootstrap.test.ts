import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"

import path from "pathe"
import { afterEach, describe, expect, it } from "vitest"

import { ensureSqliteDatabaseDirectory } from "./sqlite-bootstrap"

describe("ensureSqliteDatabaseDirectory", () => {
  const created: string[] = []

  afterEach(() => {
    for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it("创建缺失的父目录（sqlite 驱动只建文件不建目录）", () => {
    const root = mkdtempSync(path.join(tmpdir(), "suhui-sqlite-"))
    created.push(root)
    const target = path.join(root, "nested", "deeper", "suhui.db")

    expect(existsSync(path.dirname(target))).toBe(false)
    ensureSqliteDatabaseDirectory(target)
    expect(existsSync(path.dirname(target))).toBe(true)
  })

  it("目录已存在时是幂等的", () => {
    const root = mkdtempSync(path.join(tmpdir(), "suhui-sqlite-"))
    created.push(root)
    const target = path.join(root, "suhui.db")

    expect(() => {
      ensureSqliteDatabaseDirectory(target)
      ensureSqliteDatabaseDirectory(target)
    }).not.toThrow()
  })

  it("不创建数据库文件本身", () => {
    const root = mkdtempSync(path.join(tmpdir(), "suhui-sqlite-"))
    created.push(root)
    const target = path.join(root, "sub", "suhui.db")

    ensureSqliteDatabaseDirectory(target)
    expect(existsSync(target)).toBe(false)
  })
})
