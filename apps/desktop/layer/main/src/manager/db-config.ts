export type DbType = "postgres"
export type DbConfigSource = "env" | "store-override"

export type DbConfigOverride = {
  dbConn: string
  dbPassword?: string | null
  dbUser?: string | null
}

export type EffectiveDbConfig = {
  dbConn: string
  dbPassword: string
  dbType: DbType
  dbUser: string
  source: DbConfigSource
}

export type DbConnInfo =
  | { connectionString: string }
  | { host: string; port: number; database: string }

export const resolveDbType = (_env: NodeJS.ProcessEnv): DbType => "postgres"

export const parseDbConn = (raw?: string): DbConnInfo => {
  if (!raw) throw new Error("DB_CONN is required for postgres")
  if (raw.includes("://")) {
    return { connectionString: raw }
  }

  const [hostPort, dbNameRaw] = raw.split("/")
  const database = dbNameRaw || "suhui"
  const [host, portRaw] = (hostPort || "").split(":")
  const port = Number(portRaw || "5432")
  if (!host || Number.isNaN(port)) {
    throw new Error("DB_CONN must be host:port/dbname")
  }
  return { host, port, database }
}

export const normalizeDbConfigOverride = (
  override?: Partial<DbConfigOverride> | null,
): DbConfigOverride | null => {
  if (!override) return null

  const dbConn = override.dbConn?.trim() ?? ""
  if (!dbConn) return null

  return {
    dbConn,
    dbUser: override.dbUser ?? "",
    dbPassword: override.dbPassword ?? "",
  }
}

export const resolveEffectiveDbConfig = ({
  env,
  override,
}: {
  env: Record<string, string | undefined>
  override?: DbConfigOverride | null
}): EffectiveDbConfig => {
  const normalizedOverride = normalizeDbConfigOverride(override)

  if (normalizedOverride) {
    return {
      dbType: "postgres",
      dbConn: normalizedOverride.dbConn,
      dbUser: normalizedOverride.dbUser ?? "",
      dbPassword: normalizedOverride.dbPassword ?? "",
      source: "store-override",
    }
  }

  return {
    dbType: resolveDbType(env),
    dbConn: env.DB_CONN ?? "",
    dbUser: env.DB_USER ?? "",
    dbPassword: env.DB_PASSWORD ?? "",
    source: "env",
  }
}

export const toDbEnv = (
  config: Pick<EffectiveDbConfig, "dbConn" | "dbPassword" | "dbUser">,
): NodeJS.ProcessEnv => ({
  DB_CONN: config.dbConn,
  DB_PASSWORD: config.dbPassword || undefined,
  DB_USER: config.dbUser || undefined,
})

export const buildPgConfigFromResolved = (
  config: Pick<EffectiveDbConfig, "dbConn" | "dbPassword" | "dbUser">,
) => {
  const conn = parseDbConn(config.dbConn)
  const connectionTimeoutMillis = 5000
  if ("connectionString" in conn) {
    return { connectionString: conn.connectionString, connectionTimeoutMillis }
  }
  return {
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: config.dbUser || undefined,
    password: config.dbPassword || undefined,
    connectionTimeoutMillis,
  }
}

export const buildPgConfig = (env: NodeJS.ProcessEnv) =>
  buildPgConfigFromResolved(resolveEffectiveDbConfig({ env }))
