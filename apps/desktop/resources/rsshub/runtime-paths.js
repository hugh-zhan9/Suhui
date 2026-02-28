// eslint-disable-next-line no-restricted-imports
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const resolveModuleDir = (moduleUrl) => {
  try {
    const modulePath = fileURLToPath(moduleUrl)
    const baseDir = dirname(modulePath)
    if (baseDir && baseDir !== "/") {
      return baseDir
    }
  } catch {
    // noop
  }

  const cwd = process.cwd()
  if (cwd && cwd !== "/") {
    return cwd
  }
  return "/tmp"
}

export const resolveRuntimeDir = ({ envValue, fallbackName, moduleUrl }) => {
  const normalized = typeof envValue === "string" ? envValue.trim() : ""
  if (normalized) {
    return normalized
  }

  return join(resolveModuleDir(moduleUrl), fallbackName)
}
