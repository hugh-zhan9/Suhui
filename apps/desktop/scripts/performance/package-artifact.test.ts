import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { createPackage } from "@electron/asar"

import { retainedPackagedModules } from "../forge-ignore.ts"
import { inspectPackagedArtifact, locatePackagedResourceRoot } from "./package-artifact.ts"

const createFakeArtifact = async (
  options: {
    rsshub?: boolean
    asarRsshub?: boolean
    omitAppUpdate?: boolean
    omitApplication?: boolean
    omitModule?: string
  } = {},
) => {
  const root = await mkdtemp(join(tmpdir(), "suhui-artifact-test-"))
  const resources = join(root, "forge", "Suhui.app", "Contents", "Resources")
  const source = join(root, "asar-source")
  await mkdir(join(source, "dist", "main"), { recursive: true })
  await writeFile(join(source, "package.json"), '{"name":"suhui"}\n')
  await writeFile(join(source, "dist", "main", "index.js"), "export {}\n")
  if (options.asarRsshub) {
    const asarRsshub = join(source, "resources", "rsshub", "dist")
    await mkdir(asarRsshub, { recursive: true })
    await writeFile(join(asarRsshub, "server.js"), "removed runtime\n")
  }
  for (const moduleName of retainedPackagedModules) {
    if (moduleName === options.omitModule) continue
    const moduleDir = join(source, "node_modules", moduleName)
    await mkdir(moduleDir, { recursive: true })
    await writeFile(join(moduleDir, "package.json"), `{"name":"${moduleName}"}\n`)
  }
  const fontListResource =
    process.platform === "darwin"
      ? join(source, "node_modules", "font-list", "libs", "darwin", "fontlist")
      : process.platform === "win32"
        ? join(source, "node_modules", "font-list", "libs", "win32", "fonts.vbs")
        : join(source, "node_modules", "font-list", "libs", "linux", "index.js")
  await mkdir(join(fontListResource, ".."), { recursive: true })
  await writeFile(fontListResource, "native resource\n")
  const languageModel = join(
    source,
    "node_modules",
    "vscode-languagedetection",
    "model",
    "model.json",
  )
  await mkdir(join(languageModel, ".."), { recursive: true })
  await writeFile(languageModel, "{}\n")
  await mkdir(resources, { recursive: true })
  if (!options.omitApplication) await createPackage(source, join(resources, "app.asar"))
  if (!options.omitAppUpdate)
    await writeFile(join(resources, "app-update.yml"), "provider: generic\n")
  if (options.rsshub) {
    await mkdir(join(resources, "rsshub", "dist"), { recursive: true })
    await writeFile(join(resources, "rsshub", "dist", "server.js"), "removed runtime\n")
  }
  return { root, resources }
}

test("locates and inspects a clean packaged resource tree", async (t) => {
  const fixture = await createFakeArtifact()
  t.after(() => rm(fixture.root, { recursive: true, force: true }))
  assert.equal(await locatePackagedResourceRoot(join(fixture.root, "forge")), fixture.resources)
  const result = await inspectPackagedArtifact(fixture.resources, "forge-output/test/Resources")
  assert.deepEqual(result.rsshubPaths, [])
  assert.equal(Object.values(result.requiredPaths).every(Boolean), true)
})

test("fails when an RSSHub root or descendant is packaged", async (t) => {
  const fixture = await createFakeArtifact({ rsshub: true })
  t.after(() => rm(fixture.root, { recursive: true, force: true }))
  await assert.rejects(
    inspectPackagedArtifact(fixture.resources, "forge-output/test/Resources"),
    /resources\/rsshub/,
  )
})

test("fails when an RSSHub root or descendant is embedded in app.asar", async (t) => {
  const fixture = await createFakeArtifact({ asarRsshub: true })
  t.after(() => rm(fixture.root, { recursive: true, force: true }))
  await assert.rejects(
    inspectPackagedArtifact(fixture.resources, "forge-output/test/Resources"),
    /resources\/app\.asar:resources\/rsshub\/dist\/server\.js/,
  )
})

test("fails for a nonexistent artifact root", async () => {
  await assert.rejects(
    inspectPackagedArtifact("/definitely/missing/suhui-artifact", "forge-output/missing"),
    /does not exist/,
  )
  await assert.rejects(
    locatePackagedResourceRoot("/definitely/missing/suhui-forge"),
    /does not exist/,
  )
})

test("fails when each required top-level application resource is absent", async (t) => {
  for (const options of [{ omitAppUpdate: true }, { omitApplication: true }]) {
    const fixture = await createFakeArtifact(options)
    t.after(() => rm(fixture.root, { recursive: true, force: true }))
    await assert.rejects(
      inspectPackagedArtifact(fixture.resources, "forge-output/test/Resources"),
      /missing required packaged resources/,
    )
  }
})

test("fails when the application entry or any retained module is absent", async (t) => {
  const missingEntry = await createFakeArtifact()
  t.after(() => rm(missingEntry.root, { recursive: true, force: true }))
  await unlink(join(missingEntry.resources, "app.asar"))
  const emptySource = join(missingEntry.root, "empty-asar")
  await mkdir(emptySource)
  await writeFile(join(emptySource, "package.json"), '{"name":"suhui"}\n')
  await createPackage(emptySource, join(missingEntry.resources, "app.asar"))
  await assert.rejects(
    inspectPackagedArtifact(missingEntry.resources, "forge-output/test/Resources"),
    /dist\/main\/index\.js/,
  )

  for (const moduleName of retainedPackagedModules) {
    const fixture = await createFakeArtifact({ omitModule: moduleName })
    t.after(() => rm(fixture.root, { recursive: true, force: true }))
    await assert.rejects(
      inspectPackagedArtifact(fixture.resources, "forge-output/test/Resources"),
      new RegExp(moduleName.replaceAll("-", "\\-")),
    )
  }
})
