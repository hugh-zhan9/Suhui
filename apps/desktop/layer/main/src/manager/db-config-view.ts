import type { DbConfigOverride, DbConfigSource, DbType } from "./db-config"
import { resolveEffectiveDbConfig } from "./db-config"
import type { EnvLoadInfo } from "./env-loader"

export type DbConfigView = {
  dbType: DbType
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
  defaultSqlitePath,
}: {
  env: Record<string, string | undefined>
  envInfo: EnvLoadInfo
  override?: DbConfigOverride | null
  defaultSqlitePath?: string
}): DbConfigView => {
  const effectiveConfig = resolveEffectiveDbConfig({ env, override, defaultSqlitePath })

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
