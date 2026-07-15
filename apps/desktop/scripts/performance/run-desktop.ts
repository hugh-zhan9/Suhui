#!/usr/bin/env tsx

import { appendFile, mkdir, readdir, rm } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { drizzle } from "drizzle-orm/node-postgres"
import pg from "pg"
import type { ConsoleMessage, ElectronApplication, Page } from "playwright"

import * as schema from "../../../../packages/internal/database/src/schemas/postgres.ts"
import {
  selectSampleMetricsForSurface,
  type FixtureScale,
  type PerformanceBuildIdentity,
  type PerformanceSample,
} from "./contracts.ts"
import { loadCurrentBuildIdentity } from "./build-identity.ts"
import {
  TARGET_MARKER_FILE,
  buildFixtureRows,
  buildFixtureFeed,
  buildHarnessTarget,
  createDrizzleFixtureStore,
  createHarnessTarget,
  loadFixtureRows,
  readHarnessTarget,
} from "./fixture.ts"

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const outputRoot = resolve(appRoot, "out/performance")
const mainEntry = resolve(appRoot, "dist/main/index.js")
const remoteBaseUrl = "http://127.0.0.1:41595"

type Temperature = "cold" | "warm"

type CliArgs = {
  fixture: FixtureScale
  temperature: Temperature
  samples: number
  targetId: string
  rawPath: string
  prepare: boolean
}

const parseArgs = (argv: readonly string[]): CliArgs => {
  const get = (name: string) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const fixture = get("--fixture")
  const temperature = get("--temperature")
  const samples = Number(get("--samples") ?? "20")
  if (fixture !== "normal" && fixture !== "stress") throw new Error("--fixture is required")
  if (temperature !== "cold" && temperature !== "warm") {
    throw new Error("--temperature is required")
  }
  if (!Number.isInteger(samples) || samples < 20) throw new Error("--samples must be at least 20")
  return {
    fixture,
    temperature,
    samples,
    targetId: get("--target-id") ?? `t002-${fixture}`,
    rawPath: resolve(get("--raw") ?? join(outputRoot, "raw-samples.jsonl")),
    prepare: argv.includes("--prepare"),
  }
}

const assertAdminUrl = (raw: string) => {
  const url = new URL(raw)
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("SUHUI_PERFORMANCE_ADMIN_URL must be PostgreSQL")
  }
  if (decodeURIComponent(url.pathname.slice(1)) !== "postgres") {
    throw new Error("performance admin URL must target the postgres administration database")
  }
  return url
}

export const isolatedDatabaseUrl = (adminUrl: string, targetId: string) => {
  const target = buildHarnessTarget(targetId)
  const url = assertAdminUrl(adminUrl)
  url.pathname = `/${target.databaseName}`
  return { target, url: url.toString() }
}

const profileDirFor = (targetId: string) =>
  resolve(outputRoot, "profiles", buildHarnessTarget(targetId).profileId)

const provisionTarget = async (adminUrl: string, targetId: string) => {
  const { target, url } = isolatedDatabaseUrl(adminUrl, targetId)
  const admin = new pg.Pool({ connectionString: adminUrl, connectionTimeoutMillis: 5_000 })
  try {
    const exists = await admin.query("select 1 from pg_database where datname = $1", [
      target.databaseName,
    ])
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${target.databaseName}"`)
    }
  } finally {
    await admin.end()
  }
  const profileDir = profileDirFor(targetId)
  await createHarnessTarget({
    targetId,
    databaseName: target.databaseName,
    profileDir,
  })
  return { target, databaseUrl: url, profileDir }
}

const assertMarkedProfile = async (profileDir: string, databaseUrl: string) => {
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1))
  const marker = await readHarnessTarget(profileDir, databaseName)
  if (basename(profileDir) !== marker.profileId || !databaseName.startsWith("suhui_performance_")) {
    throw new Error("performance profile is not isolated")
  }
  return marker
}

export const clearHarnessProfile = async (profileDir: string, databaseUrl: string) => {
  await assertMarkedProfile(profileDir, databaseUrl)
  for (const entry of await readdir(profileDir)) {
    if (entry === TARGET_MARKER_FILE) continue
    await rm(join(profileDir, entry), { recursive: true, force: true })
  }
}

type MetricCollector = {
  metrics: Map<string, number>
  events: Array<{ metric: string; value: number; batchId?: string }>
  errors: string[]
  attachPage(page: Page): void
  attachProcess(app: ElectronApplication): void
}

const applyMetricValue = (collector: MetricCollector, input: unknown) => {
  if (!input || typeof input !== "object") return
  const value = input as Record<string, unknown>
  const metric =
    typeof value.metric === "string"
      ? value.metric
      : typeof value.name === "string"
        ? value.name
        : undefined
  const numeric = typeof value.value === "number" ? value.value : undefined
  if (metric && numeric !== undefined && Number.isFinite(numeric)) {
    collector.metrics.set(metric, numeric)
    collector.events.push({
      metric,
      value: numeric,
      ...(typeof value.batchId === "string" ? { batchId: value.batchId } : {}),
    })
  }
}

const parseMetricText = (collector: MetricCollector, text: string) => {
  for (const match of text.matchAll(/\[PerformanceMetric\]\s+(\{[^\r\n]+\})/g)) {
    try {
      applyMetricValue(collector, JSON.parse(match[1]!))
    } catch {}
  }
  const startup = text.match(
    /\b(shell_ready_ms|db_usable_ms|interactive_ms|route_scope_ready_ms|desktop_initial_entries_ready_ms|desktop_startup_entry_rows)\b[^0-9]*(\d+(?:\.\d+)?)/,
  )
  if (startup) collector.metrics.set(startup[1]!, Number(startup[2]))
}

const readConsoleMessage = async (collector: MetricCollector, message: ConsoleMessage) => {
  parseMetricText(collector, message.text())
  for (const argument of message.args()) {
    try {
      applyMetricValue(collector, await argument.jsonValue())
    } catch {}
  }
}

export const createMetricCollector = (): MetricCollector => {
  const collector: MetricCollector = {
    metrics: new Map(),
    events: [],
    errors: [],
    attachPage(page) {
      page.on("console", (message) => void readConsoleMessage(collector, message))
      page.on("pageerror", (error) => collector.errors.push(error.message))
    },
    attachProcess(app) {
      const process = app.process()
      process.stdout?.on("data", (chunk) => parseMetricText(collector, String(chunk)))
      process.stderr?.on("data", (chunk) => {
        const text = String(chunk)
        if (/FATAL|UnhandledPromiseRejection|ERR_/.test(text))
          collector.errors.push(text.slice(0, 300))
      })
    },
  }
  return collector
}

const waitFor = async (predicate: () => boolean | Promise<boolean>, timeoutMs = 45_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error("performance harness timed out waiting for a ready state")
}

export async function launchProductionApp(input: {
  profileDir: string
  databaseUrl: string
  buildIdentity?: PerformanceBuildIdentity
}): Promise<{
  app: ElectronApplication
  page: Page
  collector: MetricCollector
  buildIdentity: PerformanceBuildIdentity
  capabilityToken: string
}> {
  const marker = await assertMarkedProfile(input.profileDir, input.databaseUrl)
  const buildIdentity = input.buildIdentity ?? (await loadCurrentBuildIdentity())
  const capabilityToken = randomBytes(32).toString("hex")
  const { _electron: electron } = await import("playwright")
  const electronExecutable = (await import("electron")).default as unknown as string
  const collector = createMetricCollector()
  const app = await electron.launch({
    executablePath: electronExecutable,
    args: [mainEntry, `--user-data-dir=${input.profileDir}`],
    cwd: input.profileDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      DB_CONN: input.databaseUrl,
      DB_USER: "",
      DB_PASSWORD: "",
      SUHUI_PERFORMANCE_HARNESS: "1",
      SUHUI_PERFORMANCE_PROFILE_ID: marker.profileId,
      SUHUI_PERFORMANCE_CAPABILITY: capabilityToken,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
    timeout: 45_000,
  })
  collector.attachProcess(app)
  const page = await app.firstWindow({ timeout: 45_000 })
  collector.attachPage(page)
  return { app, page, collector, buildIdentity, capabilityToken }
}

export const waitForRemoteServer = async () => {
  await waitFor(async () => {
    try {
      return (await fetch(`${remoteBaseUrl}/health`)).ok
    } catch {
      return false
    }
  })
}

const closeApp = async (app: ElectronApplication) => {
  await Promise.race([
    app.close(),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("Electron did not exit cleanly")), 15_000),
    ),
  ])
}

const initializeSchema = async (profileDir: string, databaseUrl: string) => {
  const launched = await launchProductionApp({ profileDir, databaseUrl })
  try {
    await waitForRemoteServer()
    await waitFor(async () => {
      try {
        return (await fetch(`${remoteBaseUrl}/api/bootstrap`)).ok
      } catch {
        return false
      }
    }, 60_000)
  } finally {
    await closeApp(launched.app)
  }
}

const loadFixture = async (
  fixture: FixtureScale,
  targetId: string,
  profileDir: string,
  databaseUrl: string,
) => {
  const target = await readHarnessTarget(profileDir, new URL(databaseUrl).pathname.slice(1))
  const pool = new pg.Pool({ connectionString: databaseUrl })
  try {
    await loadFixtureRows(
      createDrizzleFixtureStore(drizzle(pool, { schema })),
      target,
      buildFixtureRows(fixture, targetId),
    )
  } finally {
    await pool.end()
  }
}

export async function preparePerformanceTarget(input: {
  adminUrl: string
  fixture: FixtureScale
  targetId: string
}) {
  const target = await provisionTarget(input.adminUrl, input.targetId)
  await initializeSchema(target.profileDir, target.databaseUrl)
  await loadFixture(input.fixture, input.targetId, target.profileDir, target.databaseUrl)
  await clearHarnessProfile(target.profileDir, target.databaseUrl)
  return target
}

const phaseQueryMetrics = [
  "entry_query_duration_ms",
  "entry_query_rows",
  "entry_fetch_to_store_ms",
] as const

const desktopFeedSwitchTimelineIds = ["all", "articles"] as const

export const clearDesktopFeedSwitchPhaseMetrics = (metrics: Map<string, number>) => {
  metrics.delete("desktop_feed_usable_ms")
  for (const metric of phaseQueryMetrics) metrics.delete(metric)
}

export const selectDesktopFeedSwitchTimelineId = (
  timelines: readonly { timelineId: string; active: boolean }[],
) =>
  desktopFeedSwitchTimelineIds.find((timelineId) =>
    timelines.some((timeline) => timeline.timelineId === timelineId && !timeline.active),
  )

const switchDesktopFeedView = async (page: Page) => {
  const timelineButtons = page.locator("[data-performance-timeline-id]")
  await timelineButtons.first().waitFor({ state: "visible" })
  const timelines = await timelineButtons.evaluateAll((buttons) =>
    buttons.map((button) => ({
      timelineId: button.getAttribute("data-performance-timeline-id") ?? "",
      active: button.getAttribute("data-active") === "true",
    })),
  )
  const targetTimelineId = selectDesktopFeedSwitchTimelineId(timelines)
  if (!targetTimelineId) {
    throw new Error("Desktop performance harness could not find a different feed view")
  }

  const target = page.locator(`[data-performance-timeline-id=${JSON.stringify(targetTimelineId)}]`)
  await target.click()
  await target.waitFor({ state: "visible" })
  await waitFor(async () => (await target.getAttribute("data-active")) === "true")
}

export const sampleDesktopPhaseMetrics = (
  feedMetrics: ReadonlyMap<string, number>,
  unreadMetrics: ReadonlyMap<string, number>,
) => {
  const shell = feedMetrics.get("shell_ready_ms")
  const db = feedMetrics.get("db_usable_ms")
  const interactive = feedMetrics.get("interactive_ms")
  const feed = feedMetrics.get("desktop_feed_usable_ms")
  const unread = unreadMetrics.get("desktop_unread_usable_ms")
  if ([shell, db, interactive, feed, unread].some((value) => value === undefined)) {
    throw new Error("Desktop startup did not emit every required ready metric")
  }
  const establishedFeed = Object.fromEntries(
    [...feedMetrics].filter(([, value]) => Number.isFinite(value)),
  ) as Record<string, number>
  establishedFeed.db_usable_to_interactive_ms = Math.max(0, interactive! - db!)
  const establishedUnread = Object.fromEntries(
    [...unreadMetrics].filter(([, value]) => Number.isFinite(value)),
  ) as Record<string, number>
  return {
    durations: {
      "desktop-shell": shell!,
      "desktop-db-to-interactive": establishedFeed.db_usable_to_interactive_ms,
      "desktop-feed-usable": feed!,
      "desktop-unread-usable": unread!,
    },
    metricsBySurface: {
      "desktop-shell": selectSampleMetricsForSurface(establishedFeed, "desktop-shell"),
      "desktop-db-to-interactive": selectSampleMetricsForSurface(
        establishedFeed,
        "desktop-db-to-interactive",
      ),
      "desktop-feed-usable": selectSampleMetricsForSurface(establishedFeed, "desktop-feed-usable"),
      "desktop-unread-usable": selectSampleMetricsForSurface(
        establishedUnread,
        "desktop-unread-usable",
      ),
    },
  }
}

export async function runDesktopLaunch(input: {
  fixture: FixtureScale
  temperature: Temperature
  targetId: string
  profileDir: string
  databaseUrl: string
  buildIdentity: PerformanceBuildIdentity
  sequence: number
}): Promise<PerformanceSample[]> {
  if (input.temperature === "cold") await clearHarnessProfile(input.profileDir, input.databaseUrl)
  const launched = await launchProductionApp(input)
  try {
    await waitFor(() =>
      ["shell_ready_ms", "db_usable_ms", "interactive_ms"].every((metric) =>
        launched.collector.metrics.has(metric),
      ),
    )
    const unreadToggle = launched.page.locator("#performance-unread-toggle")
    await unreadToggle.waitFor({ state: "visible" })
    if ((await unreadToggle.locator(".i-mgc-round-cute-fi").count()) > 0) {
      await unreadToggle.click()
      launched.collector.metrics.delete("desktop_unread_usable_ms")
    }
    await waitFor(() => launched.collector.metrics.has("desktop_feed_usable_ms"))
    await waitFor(() => phaseQueryMetrics.every((metric) => launched.collector.metrics.has(metric)))
    clearDesktopFeedSwitchPhaseMetrics(launched.collector.metrics)
    await switchDesktopFeedView(launched.page)
    await waitFor(() => launched.collector.metrics.has("desktop_feed_usable_ms"))
    await waitFor(() => phaseQueryMetrics.every((metric) => launched.collector.metrics.has(metric)))
    const feedMetrics = new Map(launched.collector.metrics)
    launched.collector.metrics.delete("desktop_unread_usable_ms")
    for (const metric of phaseQueryMetrics) launched.collector.metrics.delete(metric)
    await unreadToggle.click()
    await waitFor(() => launched.collector.metrics.has("desktop_unread_usable_ms"))
    await waitFor(() => phaseQueryMetrics.every((metric) => launched.collector.metrics.has(metric)))
    const unreadMetrics = new Map(launched.collector.metrics)
    const result = sampleDesktopPhaseMetrics(feedMetrics, unreadMetrics)
    await unreadToggle.click()
    await waitFor(async () => (await unreadToggle.locator(".i-mgc-round-cute-re").count()) > 0)
    await launched.page.waitForTimeout(100)
    const runId = `desktop-${input.fixture}-${input.temperature}-${String(input.sequence).padStart(2, "0")}`
    return Object.entries(result.durations).map(([surface, durationMs]) => ({
      buildId: input.buildIdentity.id,
      runId,
      fixture: input.fixture,
      temperature: input.temperature,
      surface: surface as PerformanceSample["surface"],
      success: true,
      durationMs,
      metrics: result.metricsBySurface[surface as keyof typeof result.metricsBySurface],
    }))
  } finally {
    await closeApp(launched.app)
  }
}

export const appendSamples = async (path: string, samples: readonly PerformanceSample[]) => {
  await mkdir(dirname(path), { recursive: true })
  const payload = samples.map((sample) => JSON.stringify(sample)).join("\n")
  await appendFile(path, `${payload}\n`)
}

export const resolvePreparedTarget = async (adminUrl: string, targetId: string) => {
  const { target, url } = isolatedDatabaseUrl(adminUrl, targetId)
  const profileDir = profileDirFor(targetId)
  await readHarnessTarget(profileDir, target.databaseName)
  return { target, databaseUrl: url, profileDir }
}

export async function collectProductionRefreshEvidence(input: {
  adminUrl: string
  fixture: FixtureScale
  targetId: string
}) {
  const target = await resolvePreparedTarget(input.adminUrl, input.targetId)
  const buildIdentity = await loadCurrentBuildIdentity()
  const launched = await launchProductionApp({ ...target, buildIdentity })
  try {
    await waitForRemoteServer()
    await waitFor(() => launched.collector.metrics.has("desktop_feed_usable_ms"))
    const evidence: Array<{
      feedCount: 1 | 10 | 50
      refresh_batch_event_count: number
      refresh_renderer_refetch_count: number
      total_entry_query_reloads: number
    }> = []
    for (const feedCount of [1, 10, 50] as const) {
      const batchId = `performance-refresh-${feedCount}`
      const queryCountBefore = launched.collector.events.filter(
        (event) => event.metric === "entry_query_duration_ms",
      ).length
      const response = await fetch(`${remoteBaseUrl}/__performance__/refresh-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Suhui-Performance-Capability": launched.capabilityToken,
        },
        body: JSON.stringify({
          batchId,
          feedIds: Array.from(
            { length: feedCount },
            (_, index) => buildFixtureFeed(input.fixture, input.targetId, index).id,
          ),
        }),
      })
      if (!response.ok) throw new Error("performance refresh injection failed")
      const body = (await response.json()) as { eventCount: number }
      await waitFor(
        () =>
          launched.collector.events.filter(
            (event) =>
              event.metric === "refresh_renderer_refetch_count" && event.batchId === batchId,
          ).length >= 1,
      )
      const refetch = launched.collector.events.findLast(
        (event) => event.metric === "refresh_renderer_refetch_count" && event.batchId === batchId,
      )
      const queryCountAfter = launched.collector.events.filter(
        (event) => event.metric === "entry_query_duration_ms",
      ).length
      const row = {
        feedCount,
        refresh_batch_event_count: body.eventCount,
        refresh_renderer_refetch_count: refetch?.value ?? -1,
        total_entry_query_reloads: queryCountAfter - queryCountBefore,
      }
      if (
        row.refresh_batch_event_count !== 1 ||
        row.refresh_renderer_refetch_count < 0 ||
        row.refresh_renderer_refetch_count > 1 ||
        row.total_entry_query_reloads > feedCount
      ) {
        throw new Error(`refresh evidence gate failed for ${feedCount} feeds`)
      }
      evidence.push(row)
    }
    return { buildIdentity, records: evidence }
  } finally {
    await closeApp(launched.app)
  }
}

async function runCli(argv: readonly string[]) {
  const args = parseArgs(argv)
  const adminUrl = process.env.SUHUI_PERFORMANCE_ADMIN_URL
  if (!adminUrl) throw new Error("SUHUI_PERFORMANCE_ADMIN_URL is required")
  const target = args.prepare
    ? await preparePerformanceTarget({
        adminUrl,
        fixture: args.fixture,
        targetId: args.targetId,
      })
    : await resolvePreparedTarget(adminUrl, args.targetId)
  const buildIdentity = await loadCurrentBuildIdentity()

  if (args.temperature === "warm") {
    await clearHarnessProfile(target.profileDir, target.databaseUrl)
    const prime = await runDesktopLaunch({
      fixture: args.fixture,
      temperature: "warm",
      targetId: args.targetId,
      profileDir: target.profileDir,
      databaseUrl: target.databaseUrl,
      buildIdentity,
      sequence: -1,
    })
    if (prime.some((sample) => !sample.success)) throw new Error("warm priming failed")
  }

  for (let sequence = 0; sequence < args.samples; sequence += 1) {
    try {
      await appendSamples(
        args.rawPath,
        await runDesktopLaunch({
          fixture: args.fixture,
          temperature: args.temperature,
          targetId: args.targetId,
          profileDir: target.profileDir,
          databaseUrl: target.databaseUrl,
          buildIdentity,
          sequence,
        }),
      )
    } catch (error) {
      const runId = `desktop-${args.fixture}-${args.temperature}-${String(sequence).padStart(2, "0")}`
      await appendSamples(
        args.rawPath,
        (
          [
            "desktop-shell",
            "desktop-db-to-interactive",
            "desktop-feed-usable",
            "desktop-unread-usable",
          ] as const
        ).map((surface) => ({
          buildId: buildIdentity.id,
          runId,
          fixture: args.fixture,
          temperature: args.temperature,
          surface,
          success: false,
          durationMs: null,
          errorCode: "ENVIRONMENT_DESKTOP_LAUNCH_FAILED",
          metrics: {},
        })),
      )
      throw error
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    const code =
      error && typeof error === "object" && "code" in error ? String(error.code) : "FAILED"
    const message =
      error instanceof Error
        ? error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
        : "unknown"
    console.error(`Desktop performance harness failed (${code}): ${message}`)
    process.exitCode = 1
  })
}
