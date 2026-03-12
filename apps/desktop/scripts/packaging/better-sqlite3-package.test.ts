import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { test } from "node:test"

import { join } from "pathe"

const findZip = () => {
  const output = execFileSync("/bin/ls", ["-1", "/tmp/suhui-forge-out/make/zip/darwin/arm64"], {
    encoding: "utf-8",
  })
  const zip = output.split("\n").find((name) => name.endsWith(".zip"))
  if (!zip) throw new Error("zip not found")
  return join("/tmp/suhui-forge-out/make/zip/darwin/arm64", zip)
}

test("packaged zip should include better_sqlite3.node", () => {
  const zipPath = findZip()
  let list = ""
  try {
    list = execFileSync("/usr/bin/unzip", ["-Z", "-1", zipPath, "*/better_sqlite3.node"], {
      encoding: "utf-8",
    })
  } catch {
    list = ""
  }
  assert.ok(
    list.includes(
      "app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    ),
  )
})
