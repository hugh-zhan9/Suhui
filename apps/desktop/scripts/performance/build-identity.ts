#!/usr/bin/env tsx

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import type { BuildArtifactHash, PerformanceBuildIdentity } from "./contracts.ts"

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const repoRoot = resolve(appRoot, "../..")
export const defaultBuildIdentityFile = resolve(appRoot, "out/performance/build-identity.json")
export const productionSourceScopes = [
  "apps/desktop",
  "packages/internal/store",
  "packages/internal/utils",
] as const

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")

const productionArtifactPrefixes = ["dist/main/", "dist/preload/", "dist/renderer/"] as const

export const isProductionArtifactName = (name: string) =>
  productionArtifactPrefixes.some((prefix) => name.startsWith(prefix)) &&
  !name.includes("/../") &&
  !name.includes("\\")

const git = (args: readonly string[], root = repoRoot) =>
  execFileSync("git", [...args], { cwd: root, encoding: "utf8" }).trimEnd()

const listFiles = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = resolve(root, entry.name)
      return entry.isDirectory() ? listFiles(absolute) : [absolute]
    }),
  )
  return nested.flat().sort()
}

const collectArtifactHashes = async (): Promise<BuildArtifactHash[]> => {
  const files = (
    await Promise.all(
      productionArtifactPrefixes.map((prefix) => listFiles(resolve(appRoot, prefix))),
    )
  )
    .flat()
    .sort()
  if (files.length === 0) throw new Error("production dist is empty")
  const artifacts = await Promise.all(
    files.map(async (absolute) => {
      const [content, metadata] = await Promise.all([readFile(absolute), stat(absolute)])
      return {
        name: relative(appRoot, absolute).replaceAll("\\", "/"),
        sha256: sha256(content),
        bytes: metadata.size,
      }
    }),
  )
  if (artifacts.some((artifact) => !isProductionArtifactName(artifact.name))) {
    throw new Error("non-production debris entered the build identity")
  }
  return artifacts.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )
}

const collectTaskSourceStatus = (root: string, scopes: readonly string[]) =>
  git(["status", "--porcelain=v1", "--untracked-files=all", "--", ...scopes], root)

export const hasTaskSourceChanges = async (
  root = repoRoot,
  scopes: readonly string[] = productionSourceScopes,
) => collectTaskSourceStatus(root, scopes).length > 0

export const collectTaskDiffHash = async (
  root = repoRoot,
  scopes: readonly string[] = productionSourceScopes,
) => {
  const trackedDiff = execFileSync("git", ["diff", "--binary", "HEAD", "--", ...scopes], {
    cwd: root,
  })
  const status = collectTaskSourceStatus(root, scopes)
  const untracked = status
    .split(/\r?\n/)
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3))
    .sort()
  const hash = createHash("sha256").update(trackedDiff)
  for (const name of untracked) {
    hash.update(`\0${name}\0`)
    hash.update(await readFile(resolve(root, name)))
  }
  return hash.digest("hex")
}

export const createBuildIdentityId = (
  input: Omit<PerformanceBuildIdentity, "id" | "generatedAt">,
) =>
  sha256(
    JSON.stringify({
      schema: input.schema,
      headCommit: input.headCommit,
      dirty: input.dirty,
      taskDiffSha256: input.taskDiffSha256,
      artifactHashes: input.artifactHashes,
    }),
  )

export async function collectBuildIdentity(): Promise<PerformanceBuildIdentity> {
  const base = {
    schema: "suhui.performance-build.v1" as const,
    headCommit: git(["rev-parse", "HEAD"]),
    dirty: await hasTaskSourceChanges(),
    taskDiffSha256: await collectTaskDiffHash(),
    artifactHashes: await collectArtifactHashes(),
  }
  return { ...base, id: createBuildIdentityId(base), generatedAt: new Date().toISOString() }
}

export function assertBuildIdentity(value: unknown): asserts value is PerformanceBuildIdentity {
  if (!value || typeof value !== "object") throw new Error("build identity must be an object")
  const input = value as Partial<PerformanceBuildIdentity>
  if (
    input.schema !== "suhui.performance-build.v1" ||
    typeof input.id !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.id) ||
    typeof input.headCommit !== "string" ||
    typeof input.dirty !== "boolean" ||
    typeof input.taskDiffSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.taskDiffSha256) ||
    !Array.isArray(input.artifactHashes) ||
    input.artifactHashes.length === 0 ||
    typeof input.generatedAt !== "string"
  ) {
    throw new Error("invalid build identity")
  }
  for (const artifact of input.artifactHashes) {
    if (
      !artifact ||
      typeof artifact.name !== "string" ||
      artifact.name.startsWith("/") ||
      !isProductionArtifactName(artifact.name) ||
      typeof artifact.bytes !== "number" ||
      artifact.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256)
    ) {
      throw new Error("invalid build artifact hash")
    }
  }
  const artifactNames = input.artifactHashes.map((artifact) => artifact.name)
  if (
    new Set(artifactNames).size !== artifactNames.length ||
    artifactNames.some((name, index) => index > 0 && artifactNames[index - 1]! > name)
  ) {
    throw new Error("build artifact hashes must be unique and sorted")
  }
  const { id: _id, generatedAt: _generatedAt, ...base } = input as PerformanceBuildIdentity
  if (createBuildIdentityId(base) !== input.id) {
    throw new Error("build identity fingerprint mismatch")
  }
}

export function assertCurrentBuildIdentity(
  recorded: PerformanceBuildIdentity,
  current: PerformanceBuildIdentity,
) {
  assertBuildIdentity(recorded)
  assertBuildIdentity(current)
  if (recorded.id !== current.id) {
    throw new Error("production build identity is stale; rebuild before collecting evidence")
  }
}

export async function loadCurrentBuildIdentity(
  identityFile = defaultBuildIdentityFile,
): Promise<PerformanceBuildIdentity> {
  const recorded = JSON.parse(await readFile(identityFile, "utf8")) as unknown
  assertBuildIdentity(recorded)
  const current = await collectBuildIdentity()
  assertCurrentBuildIdentity(recorded, current)
  return recorded
}

async function runCli(argv: readonly string[]) {
  const outputIndex = argv.indexOf("--output")
  const output = resolve(outputIndex >= 0 ? argv[outputIndex + 1]! : defaultBuildIdentityFile)
  const identity = await collectBuildIdentity()
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(identity, null, 2)}\n`)
  console.log(JSON.stringify({ buildId: identity.id, dirty: identity.dirty }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
