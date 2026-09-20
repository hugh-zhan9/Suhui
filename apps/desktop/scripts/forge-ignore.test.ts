import assert from "node:assert/strict"
import { test } from "node:test"

import { shouldIgnorePackagerPath } from "./forge-ignore.ts"

test("should ignore nested node_modules under layer", () => {
  assert.equal(shouldIgnorePackagerPath("/layer/renderer/node_modules/.vite/deps/a.js"), true)
  assert.equal(shouldIgnorePackagerPath("/layer/main/node_modules/foo/index.js"), true)
})

test("should keep whitelisted modules in root node_modules", () => {
  assert.equal(shouldIgnorePackagerPath("/node_modules/bindings/index.js"), false)
  assert.equal(shouldIgnorePackagerPath("/node_modules/bindings-extra/index.js"), true)
})

test("ignores exactly the removed RSSHub resource root and descendants", () => {
  for (const path of [
    "/resources/rsshub",
    "/resources/rsshub/",
    "/resources/rsshub/index.js",
    "\\resources\\rsshub\\dist\\worker.js",
  ]) {
    assert.equal(shouldIgnorePackagerPath(path), true, path)
  }
})

test("keeps other resources and RSSHub near misses", () => {
  for (const path of [
    "/resources",
    "/resources/app-update.yml",
    "/resources/rsshub-x/index.js",
    "/resources/rsshub.old/index.js",
    "/resources/my-rsshub/index.js",
    "/resource/rsshub/index.js",
    "/nested/resources/rsshub/index.js",
    "/layer/main/resources/rsshub/index.js",
    "\\nested\\resources\\rsshub\\index.js",
  ]) {
    assert.equal(shouldIgnorePackagerPath(path), false, path)
  }
})

test("keeps scoped retained modules in root node_modules", () => {
  assert.equal(shouldIgnorePackagerPath("/node_modules/@protobufjs/aspromise/index.js"), false)
  assert.equal(shouldIgnorePackagerPath("/node_modules/@protobufjs/other/index.js"), true)
})

test("keeps the main process runtime dependencies that used to be dropped", () => {
  for (const moduleName of ["dotenv", "ajv", "ajv-formats", "yaku"]) {
    assert.equal(
      shouldIgnorePackagerPath(`/node_modules/${moduleName}/index.js`),
      false,
      moduleName,
    )
  }
})
