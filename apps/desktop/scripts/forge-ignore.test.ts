import assert from "node:assert/strict"
import { test } from "node:test"

import { shouldIgnorePackagerPath } from "./forge-ignore"

test("should ignore nested node_modules under layer", () => {
  assert.equal(shouldIgnorePackagerPath("/layer/renderer/node_modules/.vite/deps/a.js"), true)
  assert.equal(shouldIgnorePackagerPath("/layer/main/node_modules/foo/index.js"), true)
})

test("should keep required native modules in root node_modules", () => {
  assert.equal(shouldIgnorePackagerPath("/node_modules/better-sqlite3/build/Release/a.node"), false)
})
