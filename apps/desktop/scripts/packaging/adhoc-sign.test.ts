import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import test from "node:test"

import { resolveAdhocSignTargets, shouldAdhocSignPackagedApp } from "./adhoc-sign.ts"

test("macOS 的 no-sign 构建需要 ad-hoc 重签名", () => {
  assert.equal(shouldAdhocSignPackagedApp({ platform: "darwin", isNoSignBuild: true }), true)
})

test("非 macOS 构建不执行 ad-hoc 重签名", () => {
  assert.equal(shouldAdhocSignPackagedApp({ platform: "linux", isNoSignBuild: true }), false)
})

test("正式签名构建不执行 ad-hoc 重签名", () => {
  assert.equal(shouldAdhocSignPackagedApp({ platform: "darwin", isNoSignBuild: false }), false)
})

test("目录输出路径会解析到内部的 app bundle", () => {
  const root = mkdtempSync(join(tmpdir(), "suhui-adhoc-sign-"))
  const outputDir = join(root, "溯洄-darwin-arm64")
  const appPath = join(outputDir, "溯洄.app")
  mkdirSync(appPath, { recursive: true })

  assert.deepEqual(resolveAdhocSignTargets([outputDir]), [appPath])
})
