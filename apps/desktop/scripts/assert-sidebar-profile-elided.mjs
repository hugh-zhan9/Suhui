import { readdirSync, readFileSync, statSync } from "node:fs"
import { extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const rendererDirectory = fileURLToPath(new URL("../dist/renderer/", import.meta.url))
const rendererSourceDirectory = fileURLToPath(new URL("../layer/renderer/src/", import.meta.url))
const scannerPath = fileURLToPath(import.meta.url)
const forbidden = [
  "suhui-sidebar-owner-profile-test-only",
  "sidebar-owner-profile.instrumentation",
  "sidebar-owner-profile.ts",
  "OWNER_HOOKS_TEST_SENTINEL",
  "observeOwnerRenders",
  "setOwnerProjectionMode",
  "recordSidebarOwnerRender",
  "projectSidebarModelForProfile",
  "observeSidebarOwnerRenders",
  "setSidebarProjectionProfileMode",
]

const scannedExtensions = new Set([".js", ".css", ".map"])
const collectFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? collectFiles(path) : entry.isFile() ? [path] : []
  })

const defaultRelevantInputs = [
  fileURLToPath(new URL("../configs/vite.electron-render.config.ts", import.meta.url)),
  fileURLToPath(new URL("../configs/vite.render.config.ts", import.meta.url)),
  fileURLToPath(new URL("../electron.vite.config.ts", import.meta.url)),
  fileURLToPath(new URL("../layer/renderer/vitest.config.ts", import.meta.url)),
  fileURLToPath(
    new URL(
      "../layer/renderer/src/modules/subscription-column/sidebar-owner-hooks.production.ts",
      import.meta.url,
    ),
  ),
  fileURLToPath(
    new URL(
      "../layer/renderer/src/modules/subscription-column/sidebar-owner-profile.instrumentation.ts",
      import.meta.url,
    ),
  ),
  fileURLToPath(new URL("../package.json", import.meta.url)),
  scannerPath,
  ...collectFiles(rendererSourceDirectory).filter((path) =>
    readFileSync(path, "utf8").includes("virtual:sidebar-owner-hooks"),
  ),
]

export const assertSidebarProfileElided = ({
  outputDirectory = rendererDirectory,
  relevantInputs = defaultRelevantInputs,
  forbiddenSymbols = forbidden,
} = {}) => {
  const assets = collectFiles(outputDirectory).filter((path) =>
    scannedExtensions.has(extname(path)),
  )

  if (assets.length === 0) {
    throw new Error(
      `No production renderer JS, CSS, or source-map assets found in ${outputDirectory}`,
    )
  }

  const oldestAsset = assets.reduce(
    (oldest, path) => {
      const mtimeMs = statSync(path).mtimeMs
      return mtimeMs < oldest.mtimeMs ? { path, mtimeMs } : oldest
    },
    { path: assets[0], mtimeMs: statSync(assets[0]).mtimeMs },
  )
  const staleInputs = relevantInputs
    .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
    .filter((input) => input.mtimeMs > oldestAsset.mtimeMs)

  if (staleInputs.length > 0) {
    throw new Error(
      `Renderer output is stale; rebuild before scanning. Oldest artifact: ${oldestAsset.path}. ` +
        `Newer inputs:\n${staleInputs.map((input) => input.path).join("\n")}`,
    )
  }

  const leaked = []
  for (const asset of assets) {
    const source = readFileSync(asset, "utf8")
    for (const symbol of forbiddenSymbols) {
      if (source.includes(symbol)) leaked.push(`${asset}: ${symbol}`)
    }
  }

  if (leaked.length > 0) {
    throw new Error(`Test-only sidebar profiling leaked into production:\n${leaked.join("\n")}`)
  }

  return assets.length
}

if (process.argv[1] && resolve(process.argv[1]) === scannerPath) {
  const assetCount = assertSidebarProfileElided()
  console.log(`Checked ${assetCount} renderer JS/CSS/map assets: sidebar profiling is elided`)
}
