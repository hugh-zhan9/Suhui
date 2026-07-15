import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { shouldIgnorePackagerPath } from "../forge-ignore.ts"

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf-8")) as {
  scripts?: Record<string, string>
}

test("build scripts should not depend on build:rsshub", () => {
  const scripts = pkg.scripts ?? {}
  assert.ok(!("build:rsshub" in scripts))
  for (const name of ["build:electron", "build:electron:unsigned", "build:electron-vite"]) {
    if (!scripts[name]) continue
    assert.ok(!scripts[name].includes("build:rsshub"), `${name} should not reference build:rsshub`)
  }
})

test("packaging exclusion works without a local RSSHub source directory", () => {
  assert.equal(shouldIgnorePackagerPath("/resources/rsshub"), true)
  assert.equal(shouldIgnorePackagerPath("/resources/rsshub/server/index.js"), true)
  assert.equal(shouldIgnorePackagerPath("/resources/app-update.yml"), false)
})
