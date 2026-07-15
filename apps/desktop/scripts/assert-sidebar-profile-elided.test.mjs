import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"

import { assertSidebarProfileElided } from "./assert-sidebar-profile-elided.mjs"

const root = mkdtempSync(join(tmpdir(), "suhui-sidebar-profile-elision-"))
after(() => rmSync(root, { force: true, recursive: true }))

test("rejects renderer output older than a relevant profiling-boundary input", () => {
  const outputDirectory = join(root, "renderer")
  const staleAsset = join(outputDirectory, "main.js")
  const freshAsset = join(outputDirectory, "remote.js")
  const input = join(root, "sidebar-owner-hooks.production.ts")
  mkdirSync(outputDirectory, { recursive: true })
  writeFileSync(staleAsset, "export {}")
  writeFileSync(freshAsset, "export {}")
  writeFileSync(input, "export {}")

  const oldTime = new Date("2026-01-01T00:00:00.000Z")
  const inputTime = new Date("2026-01-01T00:00:01.000Z")
  const newTime = new Date("2026-01-01T00:00:02.000Z")
  utimesSync(staleAsset, oldTime, oldTime)
  utimesSync(input, inputTime, inputTime)
  utimesSync(freshAsset, newTime, newTime)

  assert.throws(
    () =>
      assertSidebarProfileElided({
        outputDirectory,
        relevantInputs: [input],
        forbiddenSymbols: [],
      }),
    /Renderer output is stale; rebuild before scanning/,
  )
})
