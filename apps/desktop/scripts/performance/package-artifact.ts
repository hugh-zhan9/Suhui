#!/usr/bin/env tsx

import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"

import { listPackage } from "@electron/asar"

import { retainedPackagedModules, unsignedForgeOutputRoot } from "../forge-ignore.ts"

export type ArtifactInspection = {
  artifactRoot: string
  rsshubPaths: string[]
  requiredPaths: Record<string, boolean>
}

const exists = async (path: string) => {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

const assertDirectory = async (path: string, label: string) => {
  try {
    if ((await stat(path)).isDirectory()) return
  } catch {
    // Report one stable error below.
  }
  throw new Error(`${label} does not exist or is not a directory`)
}

const walkDirectories = async (root: string): Promise<string[]> => {
  const directories: string[] = [root]
  for (let index = 0; index < directories.length; index += 1) {
    const directory = directories[index]!
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        directories.push(join(directory, entry.name))
      }
    }
  }
  return directories
}

export async function locatePackagedResourceRoot(forgeOutputRoot: string): Promise<string> {
  const output = resolve(forgeOutputRoot)
  await assertDirectory(output, "Forge output root")
  const candidates: string[] = []
  for (const directory of await walkDirectories(output)) {
    if (
      (await exists(join(directory, "app.asar"))) &&
      (await exists(join(directory, "app-update.yml")))
    ) {
      candidates.push(directory)
    }
  }
  if (candidates.length !== 1) {
    throw new Error(`expected one packaged Resources root, found ${candidates.length}`)
  }
  return candidates[0]!
}

const listResourceTree = async (root: string) => {
  const paths: string[] = []
  const directories = [root]
  for (let index = 0; index < directories.length; index += 1) {
    const directory = directories[index]!
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      const path = relative(root, absolute).split(sep).join("/")
      paths.push(path)
      if (entry.isDirectory() && !entry.isSymbolicLink()) directories.push(absolute)
    }
  }
  return paths.sort()
}

const platformResource = () => {
  if (process.platform === "darwin") return "node_modules/font-list/libs/darwin/fontlist"
  if (process.platform === "win32") return "node_modules/font-list/libs/win32/fonts.vbs"
  return "node_modules/font-list/libs/linux/index.js"
}

const assertSanitizedLabel = (label: string) => {
  if (
    !label ||
    label.startsWith("/") ||
    label.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(label) ||
    label.split(/[\\/]/).includes("..")
  ) {
    throw new Error("artifact label must be a sanitized relative label")
  }
}

export async function inspectPackagedArtifact(
  artifactRoot: string,
  artifactLabel: string,
): Promise<ArtifactInspection> {
  const root = resolve(artifactRoot)
  await assertDirectory(root, "Packaged artifact root")
  assertSanitizedLabel(artifactLabel)

  const resourcePaths = await listResourceTree(root)
  const rsshubPaths = resourcePaths
    .filter((path) => path === "rsshub" || path.startsWith("rsshub/"))
    .map((path) => `resources/${path}`)

  const asarPath = join(root, "app.asar")
  const asarEntries = (await exists(asarPath))
    ? new Set(listPackage(asarPath, { isPack: false }).map((path) => path.replace(/^\//, "")))
    : new Set<string>()
  const asarRsshubPaths = Array.from(asarEntries)
    .filter((path) => path === "resources/rsshub" || path.startsWith("resources/rsshub/"))
    .map((path) => `resources/app.asar:${path}`)
  rsshubPaths.push(...asarRsshubPaths)
  rsshubPaths.sort()
  const requiredPaths: Record<string, boolean> = {
    "resources/app-update.yml": await exists(join(root, "app-update.yml")),
    "resources/app.asar": await exists(asarPath),
    "resources/app.asar:package.json": asarEntries.has("package.json"),
    "resources/app.asar:dist/main/index.js": asarEntries.has("dist/main/index.js"),
    [`resources/app.asar:${platformResource()}`]: asarEntries.has(platformResource()),
    "resources/app.asar:node_modules/vscode-languagedetection/model/model.json": asarEntries.has(
      "node_modules/vscode-languagedetection/model/model.json",
    ),
  }
  for (const moduleName of retainedPackagedModules) {
    const key = `resources/app.asar:node_modules/${moduleName}/package.json`
    requiredPaths[key] = asarEntries.has(`node_modules/${moduleName}/package.json`)
  }

  if (rsshubPaths.length > 0) {
    throw new Error(`packaged artifact contains removed ${rsshubPaths.join(", ")}`)
  }
  const missing = Object.entries(requiredPaths)
    .filter(([, present]) => !present)
    .map(([path]) => path)
  if (missing.length > 0) {
    throw new Error(`missing required packaged resources: ${missing.join(", ")}`)
  }
  return { artifactRoot: artifactLabel, rsshubPaths, requiredPaths }
}

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")

const parseCli = (argv: readonly string[]) => {
  const value = (name: string) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }
  return {
    forgeOutput: value("--forge-output") ?? unsignedForgeOutputRoot,
    output: value("--output") ?? "out/performance/artifact/package-inspection.json",
  }
}

async function runCli(argv: readonly string[]) {
  const args = parseCli(argv)
  const resourceRoot = await locatePackagedResourceRoot(args.forgeOutput)
  const relativeRoot = relative(resolve(args.forgeOutput), resourceRoot).split(sep).join("/")
  const inspection = await inspectPackagedArtifact(
    resourceRoot,
    `forge-output/${relativeRoot || "Resources"}`,
  )
  const appAsar = await readFile(join(resourceRoot, "app.asar"))
  const evidence = {
    schema: "suhui.package-artifact.v1",
    inspection,
    appAsarSha256: sha256(appAsar),
  }
  await mkdir(dirname(resolve(args.output)), { recursive: true })
  await writeFile(args.output, `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify(evidence))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
