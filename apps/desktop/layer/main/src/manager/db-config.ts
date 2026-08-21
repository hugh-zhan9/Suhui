export type DbType = "postgres" | "sqlite"
export type DbConfigSource = "env" | "store-override"

export type DbConfigOverride = {
  /** 缺省表示 postgres：既有 override 是在只支持 postgres 的年代写下的。 */
  dbType?: DbType | null
  /** postgres 时是 `host:port/db` 或 DSN；sqlite 时是数据库文件路径。 */
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

export type PostgresConnInfo =
  | { connectionString: string }
  | { host: string; port: number; database: string }

export type SqliteConnInfo = { filePath: string }

export type DbConnInfo = PostgresConnInfo | SqliteConnInfo

/**
 * 新安装默认 SQLite（零配置开箱），但既有 Postgres 安装必须原样保留。
 *
 * 因此只有在完全没有 Postgres 配置痕迹时才回落到 SQLite：`DB_TYPE` 显式指定最优先，
 * 否则只要存在 `DB_CONN` 就说明这是一个既有的 Postgres 安装。
 */
export const resolveDbType = (env: NodeJS.ProcessEnv): DbType => {
  const explicit = env.DB_TYPE?.trim().toLowerCase()
  if (explicit === "postgres" || explicit === "sqlite") return explicit
  return env.DB_CONN?.trim() ? "postgres" : "sqlite"
}

// 用重载让方言决定返回类型：postgres 调用点仍拿到原来的二元联合，
// 因此它们的 `"connectionString" in conn` 收窄无需改动。
export function parseDbConn(raw: string | undefined, dbType: "sqlite"): SqliteConnInfo
export function parseDbConn(raw?: string, dbType?: "postgres"): PostgresConnInfo
export function parseDbConn(raw?: string, dbType: DbType = "postgres"): DbConnInfo {
  if (dbType === "sqlite") {
    const filePath = raw?.trim()
    if (!filePath) throw new Error("SQLite requires a database file path")
    return { filePath }
  }

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
    // 缺省按 postgres 解释：既有 override 写下时还没有 sqlite 选项，
    // 若在此回落到默认方言会把既有用户静默切库。
    dbType: override.dbType ?? "postgres",
    dbConn,
    dbUser: override.dbUser ?? "",
    dbPassword: override.dbPassword ?? "",
  }
}

export const resolveEffectiveDbConfig = ({
  env,
  override,
  defaultSqlitePath,
}: {
  env: Record<string, string | undefined>
  override?: DbConfigOverride | null
  /** SQLite 的默认库文件路径。本模块不依赖 electron，故由调用方注入。 */
  defaultSqlitePath?: string
}): EffectiveDbConfig => {
  const normalizedOverride = normalizeDbConfigOverride(override)

  if (normalizedOverride) {
    return {
      dbType: normalizedOverride.dbType ?? "postgres",
      dbConn: normalizedOverride.dbConn,
      dbUser: normalizedOverride.dbUser ?? "",
      dbPassword: normalizedOverride.dbPassword ?? "",
      source: "store-override",
    }
  }

  const dbType = resolveDbType(env)

  return {
    dbType,
    // sqlite 未显式配置路径时用注入的默认路径
    dbConn: env.DB_CONN?.trim() || (dbType === "sqlite" ? (defaultSqlitePath ?? "") : ""),
    dbUser: env.DB_USER ?? "",
    dbPassword: env.DB_PASSWORD ?? "",
    source: "env",
  }
}

export const toDbEnv = (
  config: Pick<EffectiveDbConfig, "dbConn" | "dbPassword" | "dbUser"> &
    Partial<Pick<EffectiveDbConfig, "dbType">>,
): NodeJS.ProcessEnv => ({
  DB_TYPE: config.dbType,
  DB_CONN: config.dbConn,
  DB_PASSWORD: config.dbPassword || undefined,
  DB_USER: config.dbUser || undefined,
})

export const buildSqliteConfigFromResolved = (
  config: Pick<EffectiveDbConfig, "dbConn">,
): SqliteConnInfo => parseDbConn(config.dbConn, "sqlite")

export const buildPgConfigFromResolved = (
  config: Pick<EffectiveDbConfig, "dbConn" | "dbPassword" | "dbUser">,
) => {
  const conn = parseDbConn(config.dbConn, "postgres")
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
