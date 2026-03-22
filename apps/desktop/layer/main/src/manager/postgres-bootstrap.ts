import { Pool } from "pg"

import { parseDbConn } from "./db-config"

export const getTargetDatabaseName = (env: NodeJS.ProcessEnv) => {
  const conn = parseDbConn(env.DB_CONN)
  if ("connectionString" in conn) {
    try {
      const url = new URL(conn.connectionString)
      return url.pathname.replace("/", "") || "suhui"
    } catch {
      return "suhui"
    }
  }
  return conn.database
}

export const buildPostgresAdminConfig = (env: NodeJS.ProcessEnv) => {
  const conn = parseDbConn(env.DB_CONN)
  const connectionTimeoutMillis = 5000
  if ("connectionString" in conn) {
    const url = new URL(conn.connectionString)
    url.pathname = "/postgres"
    return { connectionString: url.toString(), connectionTimeoutMillis }
  }
  return {
    host: conn.host,
    port: conn.port,
    database: "postgres",
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    connectionTimeoutMillis,
  }
}

export const ensurePostgresDatabaseExists = async (
  env: NodeJS.ProcessEnv,
  poolFactory: (config: Record<string, unknown>) => { query: any; end: () => Promise<void> } = (
    config,
  ) => new Pool(config as any),
) => {
  const database = getTargetDatabaseName(env)
  const adminConfig = buildPostgresAdminConfig(env)
  const pool = poolFactory(adminConfig)

  try {
    const result = await pool.query("SELECT 1 FROM pg_database WHERE datname = $1", [database])
    if (!result || (result.rowCount ?? result.rows?.length ?? 0) === 0) {
      await pool.query(`CREATE DATABASE "${database}"`)
    }
  } finally {
    await pool.end()
  }
}
