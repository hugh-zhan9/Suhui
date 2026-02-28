import { existsSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { dirname, join } from "pathe"

import { buildRsshubManifest } from "./rsshub-manifest"
import { EMBEDDED_RSSHUB_ROUTES } from "./rsshub-routes"

const root = dirname(fileURLToPath(import.meta.url))
const runtimeDir = join(root, "../resources/rsshub")

const requiredFiles = ["index.js", "runtime-routes.js", "runtime-cache.js"]
for (const file of requiredFiles) {
  const fullPath = join(runtimeDir, file)
  if (!existsSync(fullPath)) {
    throw new Error(`Missing RSSHub runtime file: ${fullPath}`)
  }
}

const manifest = buildRsshubManifest({
  routes: EMBEDDED_RSSHUB_ROUTES,
  runtimeType: "embedded-lite",
})
const manifestPath = join(runtimeDir, "routes-manifest.json")
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

console.info(`[build-rsshub] manifest generated: ${manifestPath}`)
