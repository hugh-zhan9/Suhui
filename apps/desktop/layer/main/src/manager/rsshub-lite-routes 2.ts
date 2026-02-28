import { existsSync, readFileSync } from "node:fs"

import { join } from "pathe"

type RsshubManifestRoute = {
  route?: unknown
  type?: unknown
}

type RsshubManifestLike = {
  routes?: unknown
}

const normalizeRoute = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ""
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

export const extractLiteSupportedRoutes = (manifest: RsshubManifestLike | null | undefined) => {
  if (!manifest || !Array.isArray(manifest.routes)) {
    return [] as string[]
  }

  const set = new Set<string>()
  for (const item of manifest.routes as RsshubManifestRoute[]) {
    if (!item || item.type !== "whitelist" || typeof item.route !== "string") {
      continue
    }
    const normalized = normalizeRoute(item.route)
    if (!normalized) continue
    set.add(normalized)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export const loadLiteSupportedRoutes = ({
  appPath,
  resourcesPath,
  isPackaged,
}: {
  appPath: string
  resourcesPath: string
  isPackaged: boolean
}) => {
  const manifestPath = isPackaged
    ? join(resourcesPath, "rsshub", "routes-manifest.json")
    : join(appPath, "resources", "rsshub", "routes-manifest.json")

  if (!existsSync(manifestPath)) {
    return [] as string[]
  }

  try {
    const raw = readFileSync(manifestPath, "utf-8")
    const parsed = JSON.parse(raw) as RsshubManifestLike
    return extractLiteSupportedRoutes(parsed)
  } catch {
    return [] as string[]
  }
}
