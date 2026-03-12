import { resolveDbType } from "./db-config"
import type { EnvLoadInfo } from "./env-loader"

export type DbConfigView = {
  dbType: "postgres"
  dbConn: string
  dbUser: string
  dbPasswordMasked: string
  envSource?: string
  envCandidates: string[]
}

export const buildDbConfigView = ({
  env,
  envInfo,
}: {
  env: Record<string, string | undefined>
  envInfo: EnvLoadInfo
}): DbConfigView => {
  const dbType = resolveDbType(env)
  return {
    dbType,
    dbConn: env.DB_CONN ?? "",
    dbUser: env.DB_USER ?? "",
    dbPasswordMasked: env.DB_PASSWORD ? "***" : "",
    envSource: envInfo.active,
    envCandidates: envInfo.candidates,
  }
}
