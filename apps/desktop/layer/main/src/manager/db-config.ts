export type DbType = "postgres"

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

export const buildPgConfig = (env: NodeJS.ProcessEnv) => {
  const conn = parseDbConn(env.DB_CONN)
  if ("connectionString" in conn) {
    return { connectionString: conn.connectionString }
  }
  return {
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  }
}
