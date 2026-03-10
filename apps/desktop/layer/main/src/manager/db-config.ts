export type DbType = "sqlite" | "postgres"

export type DbConnInfo =
  | { connectionString: string }
  | { host: string; port: number; database: string }

export const resolveDbType = (env: NodeJS.ProcessEnv): DbType =>
  env.DB_TYPE === "postgres" ? "postgres" : "sqlite"

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
