import { execSync } from "node:child_process"
import { createRequire } from "node:module"
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { dirname, join, relative } from "pathe"

import { buildRsshubManifest } from "./rsshub-manifest"
import { EMBEDDED_RSSHUB_ROUTES } from "./rsshub-routes"

const root = dirname(fileURLToPath(import.meta.url))
const runtimeDir = join(root, "../resources/rsshub")
const officialRuntimeDir = join(runtimeDir, "official-runtime")
const officialVersionMarkerPath = join(officialRuntimeDir, ".rsshub-version")
const chromeManifestPath = join(runtimeDir, "chrome-manifest.json")
const officialPkgEntryPath = join(
  officialRuntimeDir,
  "node_modules",
  "rsshub",
  "dist-lib",
  "pkg.mjs",
)
const chromeCacheDir = join(runtimeDir, "chrome")
const RSSHUB_OFFICIAL_VERSION = "1.0.0-master.5ddd208"

const shouldSkipOfficialRuntimeProvision =
  process.env["FREEFOLO_SKIP_OFFICIAL_RUNTIME_PROVISION"] === "1"
const shouldSkipChromeProvision = process.env["FREEFOLO_SKIP_RSSHUB_CHROME_PROVISION"] === "1"

const ensureOfficialRuntime = () => {
  if (shouldSkipOfficialRuntimeProvision) {
    console.info("[build-rsshub] skip official runtime provision by env")
    return
  }

  const currentVersion = existsSync(officialVersionMarkerPath)
    ? readFileSync(officialVersionMarkerPath, "utf8").trim()
    : ""

  if (currentVersion === RSSHUB_OFFICIAL_VERSION && existsSync(officialPkgEntryPath)) {
    console.info(`[build-rsshub] official runtime already prepared: ${RSSHUB_OFFICIAL_VERSION}`)
    return
  }

  const tempInstallDir = join(root, "../.tmp/rsshub-official-runtime")
  rmSync(tempInstallDir, { recursive: true, force: true })
  mkdirSync(tempInstallDir, { recursive: true })

  writeFileSync(
    join(tempInstallDir, "package.json"),
    JSON.stringify(
      {
        name: "freefolo-rsshub-official-runtime",
        private: true,
        version: "0.0.0",
      },
      null,
      2,
    ),
  )

  console.info(`[build-rsshub] installing rsshub@${RSSHUB_OFFICIAL_VERSION} ...`)
  execSync(`npm install --omit=dev --no-audit --no-fund rsshub@${RSSHUB_OFFICIAL_VERSION}`, {
    cwd: tempInstallDir,
    stdio: "inherit",
    env: process.env,
  })

  rmSync(officialRuntimeDir, { recursive: true, force: true })
  mkdirSync(officialRuntimeDir, { recursive: true })
  cpSync(join(tempInstallDir, "node_modules"), join(officialRuntimeDir, "node_modules"), {
    recursive: true,
    dereference: true,
  })
  writeFileSync(officialVersionMarkerPath, RSSHUB_OFFICIAL_VERSION)

  rmSync(tempInstallDir, { recursive: true, force: true })
  console.info(`[build-rsshub] official runtime ready: ${RSSHUB_OFFICIAL_VERSION}`)
}

const ensureBundledChrome = () => {
  if (shouldSkipChromeProvision) {
    console.info("[build-rsshub] skip bundled chrome provision by env")
    return
  }

  const rsshubPkgJsonPath = join(officialRuntimeDir, "node_modules", "rsshub", "package.json")
  if (!existsSync(rsshubPkgJsonPath)) {
    throw new Error(`Missing RSSHub package for chrome provision: ${rsshubPkgJsonPath}`)
  }

  const runtimeRequire = createRequire(rsshubPkgJsonPath)
  const revisions = runtimeRequire("puppeteer-core/lib/cjs/puppeteer/revisions.js") as {
    PUPPETEER_REVISIONS?: { chrome?: string }
  }
  const chromeBuildId = revisions?.PUPPETEER_REVISIONS?.chrome
  if (!chromeBuildId) {
    throw new Error("Unable to resolve puppeteer chrome build id from official runtime")
  }

  const browsers = runtimeRequire("@puppeteer/browsers") as {
    computeExecutablePath: (input: {
      browser: string
      buildId: string
      cacheDir: string
    }) => string
  }
  const executablePath = browsers.computeExecutablePath({
    browser: "chrome",
    buildId: chromeBuildId,
    cacheDir: chromeCacheDir,
  })

  const currentManifest =
    existsSync(chromeManifestPath) && existsSync(executablePath)
      ? JSON.parse(readFileSync(chromeManifestPath, "utf-8"))
      : null
  if (currentManifest?.buildId === chromeBuildId && existsSync(executablePath)) {
    console.info(`[build-rsshub] bundled chrome already prepared: ${chromeBuildId}`)
    return
  }

  mkdirSync(chromeCacheDir, { recursive: true })
  const browsersCliPath = join(
    officialRuntimeDir,
    "node_modules",
    "@puppeteer",
    "browsers",
    "lib",
    "cjs",
    "main-cli.js",
  )

  console.info(`[build-rsshub] installing chrome@${chromeBuildId} ...`)
  execSync(`${process.execPath} "${browsersCliPath}" install "chrome@${chromeBuildId}" --path "${chromeCacheDir}"`, {
    stdio: "inherit",
    env: process.env,
  })

  if (!existsSync(executablePath)) {
    throw new Error(`Bundled chrome executable not found after install: ${executablePath}`)
  }

  writeFileSync(
    chromeManifestPath,
    JSON.stringify(
      {
        version: 1,
        buildId: chromeBuildId,
        cacheDirRelative: "chrome",
        executablePathRelative: relative(runtimeDir, executablePath),
      },
      null,
      2,
    ),
  )
  console.info(`[build-rsshub] bundled chrome ready: ${executablePath}`)
}

const requiredFiles = [
  "index.js",
  "official-entry.js",
  "official-whitelist.js",
  "runtime-routes.js",
  "runtime-cache.js",
]
for (const file of requiredFiles) {
  const fullPath = join(runtimeDir, file)
  if (!existsSync(fullPath)) {
    throw new Error(`Missing RSSHub runtime file: ${fullPath}`)
  }
}

ensureOfficialRuntime()
ensureBundledChrome()

if (!existsSync(officialPkgEntryPath)) {
  throw new Error(`Missing RSSHub official runtime entry: ${officialPkgEntryPath}`)
}

const manifest = buildRsshubManifest({
  routes: EMBEDDED_RSSHUB_ROUTES,
  runtimeType: "embedded-dual",
})
const manifestPath = join(runtimeDir, "routes-manifest.json")
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

console.info(`[build-rsshub] manifest generated: ${manifestPath}`)
