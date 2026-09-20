import { existsSync, readdirSync, readFileSync } from "node:fs"
import { builtinModules } from "node:module"

import path from "pathe"

const nodeBuiltins = new Set(builtinModules)

// The clause between `import` and the specifier is consumed by a class that cannot hold
// a quote, so this stays linear on minified one-line bundles where statements are only
// separated by `;`. The lookahead is what keeps an object property named `import` --
// `import: defineRoute("POST", ...)` -- from being read as a module specifier.
const staticImportPattern = /(?:^|[\n;{}])\s*import(?=[\s{*"'])[^"'\n:;()]*["']([^"'\n]+)["']/g
const dynamicImportPattern = /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g
const requirePattern = /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g

const bundleFilePattern = /\.(?:js|mjs|cjs)$/

export const toPackageName = (specifier: string) =>
  specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : (specifier.split("/")[0] ?? "")

export const collectExternalPackages = (source: string) => {
  const packages = new Set<string>()

  for (const pattern of [staticImportPattern, dynamicImportPattern, requirePattern]) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]!
      if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) {
        continue
      }

      const name = toPackageName(specifier)
      if (name === "" || name === "electron" || nodeBuiltins.has(name)) {
        continue
      }

      packages.add(name)
    }
  }

  return packages
}

const collectBundleFiles = (directory: string) => {
  const files: string[] = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectBundleFiles(entryPath))
    } else if (bundleFilePattern.test(entry.name)) {
      files.push(entryPath)
    }
  }

  return files
}

export const findUnretainedPackages = ({
  bundleDirs,
  retainedModules,
}: {
  bundleDirs: string[]
  retainedModules: readonly string[]
}) => {
  const retained = new Set(retainedModules)
  const missing = new Set<string>()

  for (const bundleDir of bundleDirs) {
    if (!existsSync(bundleDir)) {
      throw new Error(
        `Cannot verify packaged modules: ${bundleDir} is missing. Build the app before packaging.`,
      )
    }

    for (const file of collectBundleFiles(bundleDir)) {
      for (const name of collectExternalPackages(readFileSync(file, "utf8"))) {
        if (!retained.has(name)) {
          missing.add(name)
        }
      }
    }
  }

  return [...missing].sort()
}

export const assertPackagedModulesCovered = (options: {
  bundleDirs: string[]
  retainedModules: readonly string[]
}) => {
  const missing = findUnretainedPackages(options)
  if (missing.length === 0) {
    return
  }

  throw new Error(
    `These packages are imported by the built main/preload bundles but are not in ` +
      `retainedPackagedModules, so the packaged app would fail to load its main script: ` +
      `${missing.join(", ")}. Add them, plus their own dependencies, to scripts/forge-ignore.ts.`,
  )
}
