import type { PgRemoteDatabase } from "drizzle-orm/pg-proxy"
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy"
import { drizzle as drizzleSqlite } from "drizzle-orm/sqlite-proxy"

import { migrateFromIndexedDB } from "./migrate-indexed-db"
import * as schema from "./schemas"

export let db: SqliteRemoteDatabase<typeof schema> | PgRemoteDatabase<typeof schema>

export async function initializeDB() {
  const { electron } = window as any
  if (!electron || !electron.ipcRenderer) {
    console.warn("[Local-First] IPC Renderer not found. Backend DB may not be accessible.")
    return
  }

  let dbType: "sqlite" | "postgres" = "sqlite"
  try {
    dbType = await electron.ipcRenderer.invoke("db.getDialect")
  } catch (error) {
    console.warn("[Local-First] Failed to get DB dialect, defaulting to sqlite.", error)
  }

  if (dbType === "postgres") {
    const { drizzle } = await import("drizzle-orm/pg-proxy")
    db = drizzle(
      async (sql, params, method) => {
        try {
          const mappedMethod = method === "execute" ? "run" : "all"
          return await electron.ipcRenderer.invoke("db.executeRawSql", sql, params, mappedMethod)
        } catch (error) {
          console.error(`[IPC DB Proxy] Error executing SQL: ${sql} with params:${params}`, error)
          return { rows: [] }
        }
      },
      {
        schema,
        logger: false,
      },
    )
    return
  }

  // Start migration in background (don't block initial load if possible,
  // but better to run before the first query? Actually hydrate will run later)
  void migrateFromIndexedDB()

  db = drizzleSqlite(
    async (sql, params, method) => {
      try {
        const result = await electron.ipcRenderer.invoke("db.executeRawSql", sql, params, method)
        return result
      } catch (error) {
        console.error(`[IPC DB Proxy] Error executing SQL: ${sql} with params:${params}`, error)
        return { rows: [] }
      }
    },
    {
      schema,
      logger: false,
    },
  )
}

export async function migrateDB() {
  // [Local Mode] Main process handles DB migrations on startup
}

export async function getDBFile() {
  console.warn("getDBFile is not supported with IPC backend.")
  return new Blob()
}

export async function exportDB() {
  console.warn("exportDB is not supported with IPC backend.")
}

export async function deleteDB() {
  console.warn("deleteDB is not supported with IPC backend.")
}
