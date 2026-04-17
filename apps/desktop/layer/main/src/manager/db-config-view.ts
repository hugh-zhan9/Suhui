import type { DbConfigOverride, DbConfigSource } from "./db-config"
import { resolveEffectiveDbConfig } from "./db-config"
import type { EnvLoadInfo } from "./env-loader"

export type DbConfigView = {
  dbType: "postgres"
  dbConn: string
  dbUser: string
  dbPasswordMasked: string
  effectiveSource: DbConfigSource
  overrideActive: boolean
  envSource?: string
  envCandidates: string[]
}

export const buildDbConfigView = ({
  env,
  envInfo,
  override,
}: {
  env: Record<string, string | undefined>
  envInfo: EnvLoadInfo
  override?: DbConfigOverride | null
}): DbConfigView => {
  const effectiveConfig = resolveEffectiveDbConfig({ env, override })

  return {
    dbType: effectiveConfig.dbType,
    dbConn: effectiveConfig.dbConn,
    dbUser: effectiveConfig.dbUser,
    dbPasswordMasked: effectiveConfig.dbPassword ? "***" : "",
    effectiveSource: effectiveConfig.source,
    overrideActive: effectiveConfig.source === "store-override",
    envSource: envInfo.active,
    envCandidates: envInfo.candidates,
  }
}
