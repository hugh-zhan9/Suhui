#!/usr/bin/env tsx

import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { loadCurrentBuildIdentity } from "./build-identity.ts"
import type { PerformanceSample } from "./contracts.ts"
import {
  assertPerformanceSample,
  collectOperationalEvidence,
  type RefreshEvidence,
} from "./evidence.ts"
import { collectProductionRefreshEvidence } from "./run-desktop.ts"

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const outputRoot = resolve(appRoot, "out/performance")
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")

const readSamples = async (name: string) => {
  const serialized = await readFile(name, "utf8")
  const samples = serialized
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown)
  samples.forEach(assertPerformanceSample)
  return samples as PerformanceSample[]
}

async function runCli(argv: readonly string[]) {
  const value = (name: string) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const adminUrl = process.env.SUHUI_PERFORMANCE_ADMIN_URL
  if (!adminUrl) throw new Error("SUHUI_PERFORMANCE_ADMIN_URL is required")
  const rawName = resolve(value("--raw") ?? `${outputRoot}/raw-samples.jsonl`)
  const refreshName = resolve(value("--refresh") ?? `${outputRoot}/refresh-evidence.json`)
  const evidenceName = resolve(value("--output") ?? `${outputRoot}/operational-evidence.json`)
  const targetId = value("--target-id") ?? "t002-normal"
  const samples = await readSamples(rawName)
  const buildIdentity = await loadCurrentBuildIdentity()
  if (samples.some((sample) => sample.buildId !== buildIdentity.id)) {
    throw new Error("raw samples do not match the current production build")
  }

  const refreshResult = await collectProductionRefreshEvidence({
    adminUrl,
    fixture: "normal",
    targetId,
  })
  if (refreshResult.buildIdentity.id !== buildIdentity.id) {
    throw new Error("refresh evidence build changed during collection")
  }
  const collectorSource = await readFile(resolve(appRoot, "scripts/performance/run-desktop.ts"))
  const refresh: RefreshEvidence = {
    schema: "suhui.performance-refresh.v1",
    buildId: buildIdentity.id,
    collectorSha256: sha256(collectorSource),
    records: refreshResult.records,
  }
  const evidence = await collectOperationalEvidence({ buildIdentity, samples, refresh })
  await mkdir(dirname(evidenceName), { recursive: true })
  await Promise.all([
    writeFile(refreshName, `${JSON.stringify(refresh, null, 2)}\n`),
    writeFile(evidenceName, `${JSON.stringify(evidence, null, 2)}\n`),
  ])
  console.log(JSON.stringify({ buildId: buildIdentity.id, samples: samples.length }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
