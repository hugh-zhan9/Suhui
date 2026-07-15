#!/usr/bin/env tsx

import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import type { Browser, BrowserContext, Page } from "playwright"

import {
  selectSampleMetricsForSurface,
  type FixtureScale,
  type PerformanceSample,
} from "./contracts.ts"
import {
  appendSamples,
  createMetricCollector,
  launchProductionApp,
  preparePerformanceTarget,
  resolvePreparedTarget,
  waitForRemoteServer,
} from "./run-desktop.ts"

const outputRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../out/performance")
const remoteUrl = "http://127.0.0.1:41595/"

type Temperature = "cold" | "warm"

const parseArgs = (argv: readonly string[]) => {
  const get = (name: string) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const fixture = get("--fixture")
  const temperature = get("--temperature")
  const samples = Number(get("--samples") ?? "20")
  const evidence = get("--evidence") ?? "both"
  if (fixture !== "normal" && fixture !== "stress") throw new Error("--fixture is required")
  if (temperature !== "cold" && temperature !== "warm") {
    throw new Error("--temperature is required")
  }
  if (!Number.isInteger(samples) || samples < 20) throw new Error("--samples must be at least 20")
  if (!["bootstrap", "entries", "both"].includes(evidence)) throw new Error("--evidence is invalid")
  return {
    fixture,
    temperature,
    samples,
    targetId: get("--target-id") ?? `t002-${fixture}`,
    rawPath: resolve(get("--raw") ?? `${outputRoot}/raw-samples.jsonl`),
    prepare: argv.includes("--prepare"),
    failureEvidence: argv.includes("--failure-evidence"),
    evidenceOnly: argv.includes("--evidence-only"),
    evidence: evidence as "bootstrap" | "entries" | "both",
  } as const
}

const waitForMetric = async (metrics: Map<string, number>, name: string, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = metrics.get(name)
    if (value !== undefined) return value
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`remote metric timeout: ${name}`)
}

const createContext = (browser: Browser) =>
  browser.newContext({ viewport: { width: 1440, height: 900 } })

const applyCacheControl = async (context: BrowserContext, page: Page, cacheDisabled: boolean) => {
  if (!cacheDisabled) return
  const cdp = await context.newCDPSession(page)
  await cdp.send("Network.enable")
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true })
}

const runNavigation = async (input: {
  context: BrowserContext
  fixture: FixtureScale
  temperature: Temperature
  sequence: number
  buildId: string
  cacheDisabled: boolean
  mainMetrics: Map<string, number>
}) => {
  const page = await input.context.newPage()
  const collector = createMetricCollector()
  collector.attachPage(page)
  try {
    await applyCacheControl(input.context, page, input.cacheDisabled)
    await page.goto(remoteUrl, { waitUntil: "domcontentloaded", timeout: 30_000 })
    const shell = await waitForMetric(collector.metrics, "remote_shell_visible_ms")
    const dataReady = await waitForMetric(collector.metrics, "remote_data_ready_ms")
    const metrics = Object.fromEntries([...input.mainMetrics, ...collector.metrics])
    const runId = `remote-${input.fixture}-${input.temperature}-${String(input.sequence).padStart(2, "0")}`
    return (
      [
        ["remote-shell", shell],
        ["remote-data-ready", dataReady],
      ] as const
    ).map(([surface, durationMs]) => ({
      runId,
      buildId: input.buildId,
      fixture: input.fixture,
      temperature: input.temperature,
      surface,
      success: true,
      durationMs,
      metrics: selectSampleMetricsForSurface(metrics, surface),
    })) satisfies PerformanceSample[]
  } finally {
    await page.close()
  }
}

const runBootstrapFailureEvidence = async (input: {
  context: BrowserContext
  fixture: FixtureScale
  temperature: Temperature
  buildId: string
  cacheDisabled: boolean
  mainMetrics: Map<string, number>
}) => {
  const page = await input.context.newPage()
  const collector = createMetricCollector()
  collector.attachPage(page)
  await applyCacheControl(input.context, page, input.cacheDisabled)
  let attempts = 0
  await page.route("**/api/bootstrap", async (route) => {
    attempts += 1
    await new Promise((resolve) => setTimeout(resolve, 250))
    if (attempts === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: '{"error":"INJECTED_BOOTSTRAP_FAILURE"}',
      })
      return
    }
    await route.continue()
  })
  try {
    await page.goto(remoteUrl, { waitUntil: "domcontentloaded" })
    const shell = await waitForMetric(collector.metrics, "remote_shell_visible_ms")
    const errorVisible = await waitForMetric(collector.metrics, "remote_bootstrap_error_visible_ms")
    await page.getByRole("button", { name: "Retry metadata" }).click()
    const ready = await waitForMetric(collector.metrics, "remote_data_ready_ms")
    return {
      runId: `remote-${input.fixture}-${input.temperature}-bootstrap-failure`,
      buildId: input.buildId,
      fixture: input.fixture,
      temperature: input.temperature,
      surface: "remote-data-ready",
      success: false,
      durationMs: null,
      errorCode: "INJECTED_REMOTE_BOOTSTRAP_FAILURE",
      metrics: selectSampleMetricsForSurface(
        {
          ...Object.fromEntries(input.mainMetrics),
          ...Object.fromEntries(collector.metrics),
          remote_shell_visible_ms: shell,
          remote_bootstrap_error_visible_ms: errorVisible,
          injected_retry_final_success_ms: ready,
        },
        "remote-data-ready",
      ),
    } satisfies PerformanceSample
  } finally {
    await page.close()
  }
}

const runEntriesFailureEvidence = async (input: {
  context: BrowserContext
  fixture: FixtureScale
  temperature: Temperature
  buildId: string
  cacheDisabled: boolean
  mainMetrics: Map<string, number>
}) => {
  const page = await input.context.newPage()
  const collector = createMetricCollector()
  collector.attachPage(page)
  await applyCacheControl(input.context, page, input.cacheDisabled)
  let attempts = 0
  let allowSuccess = false
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname !== "/api/entries") {
      await route.continue()
      return
    }
    attempts += 1
    if (!allowSuccess) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: '{"error":"INJECTED_ENTRIES_FAILURE"}',
      })
      return
    }
    await route.continue()
  })
  try {
    await page.goto(remoteUrl, { waitUntil: "domcontentloaded" })
    const shell = await waitForMetric(collector.metrics, "remote_shell_visible_ms")
    let errorVisible: number
    try {
      errorVisible = await waitForMetric(collector.metrics, "remote_entries_error_visible_ms")
    } catch {
      throw new Error(`remote entries error was not visible after ${attempts} intercepted attempts`)
    }
    allowSuccess = true
    await page.getByRole("button", { name: "Retry entries" }).click()
    const ready = await waitForMetric(collector.metrics, "remote_data_ready_ms")
    return {
      runId: `remote-${input.fixture}-${input.temperature}-entries-failure`,
      buildId: input.buildId,
      fixture: input.fixture,
      temperature: input.temperature,
      surface: "remote-data-ready",
      success: false,
      durationMs: null,
      errorCode: "INJECTED_REMOTE_ENTRIES_FAILURE",
      metrics: selectSampleMetricsForSurface(
        {
          ...Object.fromEntries(input.mainMetrics),
          ...Object.fromEntries(collector.metrics),
          remote_shell_visible_ms: shell,
          remote_entries_error_visible_ms: errorVisible,
          injected_retry_final_success_ms: ready,
        },
        "remote-data-ready",
      ),
    } satisfies PerformanceSample
  } finally {
    await page.close()
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
  const desktop = await launchProductionApp(target)
  const { chromium } = await import("playwright")
  const browser = await chromium.launch({
    executablePath:
      process.env.SUHUI_PERFORMANCE_CHROME_PATH ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  })
  try {
    await waitForRemoteServer()
    let warmContext: BrowserContext | null = null
    if (args.temperature === "warm") {
      warmContext = await createContext(browser)
      const preheat = await warmContext.newPage()
      const preheatCollector = createMetricCollector()
      preheatCollector.attachPage(preheat)
      await preheat.goto(remoteUrl, { waitUntil: "domcontentloaded" })
      await preheat.locator("#root").waitFor({ state: "visible" })
      await waitForMetric(preheatCollector.metrics, "remote_data_ready_ms")
      await preheat.close()
    }

    try {
      if (!args.evidenceOnly) {
        for (let sequence = 0; sequence < args.samples; sequence += 1) {
          const context = warmContext ?? (await createContext(browser))
          try {
            await appendSamples(
              args.rawPath,
              await runNavigation({
                context,
                fixture: args.fixture,
                temperature: args.temperature,
                sequence,
                buildId: desktop.buildIdentity.id,
                cacheDisabled: args.temperature === "cold",
                mainMetrics: desktop.collector.metrics,
              }),
            )
          } finally {
            if (!warmContext) await context.close()
          }
        }
      }

      if (args.failureEvidence) {
        const bootstrapContext = args.evidence === "entries" ? null : await createContext(browser)
        const entriesContext = args.evidence === "bootstrap" ? null : await createContext(browser)
        try {
          if (bootstrapContext) {
            await appendSamples(args.rawPath, [
              await runBootstrapFailureEvidence({
                context: bootstrapContext,
                fixture: args.fixture,
                temperature: args.temperature,
                buildId: desktop.buildIdentity.id,
                cacheDisabled: true,
                mainMetrics: desktop.collector.metrics,
              }),
            ])
          }
          if (entriesContext) {
            await appendSamples(args.rawPath, [
              await runEntriesFailureEvidence({
                context: entriesContext,
                fixture: args.fixture,
                temperature: args.temperature,
                buildId: desktop.buildIdentity.id,
                cacheDisabled: true,
                mainMetrics: desktop.collector.metrics,
              }),
            ])
          }
        } finally {
          await Promise.all(
            [bootstrapContext?.close(), entriesContext?.close()].filter(
              (closing): closing is Promise<void> => !!closing,
            ),
          )
        }
      }
    } finally {
      await warmContext?.close()
    }
  } finally {
    await browser.close()
    await desktop.app.close()
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
    console.error(`Remote performance harness failed (${code}): ${message}`)
    process.exitCode = 1
  })
}
