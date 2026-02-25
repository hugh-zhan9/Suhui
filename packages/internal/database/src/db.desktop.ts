import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy"
import { drizzle } from "drizzle-orm/sqlite-proxy"
import * as schema from "./schemas"
import { migrateFromIndexedDB } from "./migrate-indexed-db"

export let db: SqliteRemoteDatabase<typeof schema>

export async function initializeDB() {
  // Start migration in background (don't block initial load if possible, 
  // but better to run before the first query? Actually hydrate will run later)
  void migrateFromIndexedDB()
  
  db = drizzle(
    async (sql, params, method) => {
      try {
        const electron = (window as any).electron
        if (!electron || !electron.ipcRenderer) {
           console.warn("[Local-First] IPC Renderer not found. Backend DB may not be accessible.")
           return { rows: [] }
        }
        
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
