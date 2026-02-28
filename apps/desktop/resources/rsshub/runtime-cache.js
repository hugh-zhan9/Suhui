import { existsSync, readdirSync, rmSync, statSync } from "node:fs"

import { join } from "pathe"

const walkFiles = (dir, files = []) => {
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(fullPath, files)
      continue
    }
    if (entry.isFile()) {
      const stat = statSync(fullPath)
      files.push({
        path: fullPath,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      })
    }
  }
  return files
}

export const getDirectorySize = (dir) =>
  walkFiles(dir).reduce((acc, current) => acc + current.size, 0)

export const cleanupCacheDir = (dir, maxBytes) => {
  if (!existsSync(dir) || maxBytes <= 0) return []

  const files = walkFiles(dir).sort((a, b) => a.mtimeMs - b.mtimeMs)
  let total = files.reduce((acc, current) => acc + current.size, 0)
  const deleted = []

  for (const file of files) {
    if (total <= maxBytes) break
    rmSync(file.path, { force: true })
    total -= file.size
    deleted.push(file.path)
  }

  return deleted
}
