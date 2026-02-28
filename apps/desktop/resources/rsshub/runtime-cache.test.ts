import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"

import { join } from "pathe"
import { afterEach, describe, expect, it } from "vitest"

import { cleanupCacheDir, getDirectorySize } from "./runtime-cache.js"

const testRoots: string[] = []

const createTempDir = () => {
  const root = join(tmpdir(), `freefolo-rsshub-cache-${Date.now()}-${Math.random()}`)
  mkdirSync(root, { recursive: true })
  testRoots.push(root)
  return root
}

afterEach(() => {
  for (const root of testRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe("runtime-cache", () => {
  it("应计算目录大小", () => {
    const root = createTempDir()
    writeFileSync(join(root, "a.txt"), "12345")
    writeFileSync(join(root, "b.txt"), "12345")

    expect(getDirectorySize(root)).toBe(10)
  })

  it("超限时应按最旧优先删除文件", () => {
    const root = createTempDir()
    const oldFile = join(root, "old.bin")
    const newFile = join(root, "new.bin")
    writeFileSync(oldFile, Buffer.alloc(8))
    writeFileSync(newFile, Buffer.alloc(8))

    const now = Date.now() / 1000
    utimesSync(oldFile, now - 100, now - 100)
    utimesSync(newFile, now, now)

    const deleted = cleanupCacheDir(root, 10)
    expect(deleted.some((path: string) => path.endsWith("old.bin"))).toBe(true)
    expect(deleted.some((path: string) => path.endsWith("new.bin"))).toBe(false)
    expect(getDirectorySize(root)).toBeLessThanOrEqual(10)
  })
})
