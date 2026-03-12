import fs from "node:fs"

import dotenv from "dotenv"
import { join } from "pathe"

export type EnvLoadInfo = {
  candidates: string[]
  active?: string
}

export const resolveEnvPaths = ({
  userDataPath,
  resourcesPath,
  workspacePath,
}: {
  userDataPath: string
  resourcesPath?: string
  workspacePath?: string
}) => {
  const paths: string[] = []
  if (resourcesPath) {
    paths.push(join(resourcesPath, ".env"))
  }
  if (workspacePath) {
    paths.push(join(workspacePath, ".env"))
  }
  paths.push(join(userDataPath, ".env"))
  return paths
}

let lastEnvInfo: EnvLoadInfo = { candidates: [] }

export const getDesktopEnvInfo = () => lastEnvInfo

export const loadDesktopEnv = ({
  userDataPath,
  resourcesPath,
  workspacePath,
}: {
  userDataPath: string
  resourcesPath?: string
  workspacePath?: string
}) => {
  const paths = resolveEnvPaths({ userDataPath, resourcesPath, workspacePath })
  const candidates: string[] = []
  for (const path of paths) {
    if (!fs.existsSync(path)) continue
    candidates.push(path)
    dotenv.config({ path, override: true })
  }
  const active = candidates.at(-1)
  lastEnvInfo = { candidates, active }
  return lastEnvInfo
}
