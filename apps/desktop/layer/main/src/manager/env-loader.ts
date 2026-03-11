import fs from "node:fs"

import dotenv from "dotenv"
import { join } from "pathe"

export const resolveEnvPaths = ({
  userDataPath,
  resourcesPath,
}: {
  userDataPath: string
  resourcesPath?: string
}) => {
  const paths: string[] = []
  if (resourcesPath) {
    paths.push(join(resourcesPath, ".env"))
  }
  paths.push(join(userDataPath, ".env"))
  return paths
}

export const loadDesktopEnv = ({
  userDataPath,
  resourcesPath,
}: {
  userDataPath: string
  resourcesPath?: string
}) => {
  const paths = resolveEnvPaths({ userDataPath, resourcesPath })
  for (const path of paths) {
    if (!fs.existsSync(path)) continue
    dotenv.config({ path, override: true })
  }
}
