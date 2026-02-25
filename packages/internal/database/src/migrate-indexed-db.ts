// @ts-nocheck
/**
 * One-time migration from IndexedDB (wa-sqlite) to Main Process (folo_local.db)
 */
export async function migrateFromIndexedDB() {
  const IDB_NAME = "WA_SQLITE"
  const SQLITE_DB_NAME = "follow.db"

  // 1. Check if the old database exists in IndexedDB
  const dbs = await indexedDB.databases()
  const exists = dbs.some(db => db.name === IDB_NAME)
  if (!exists) return

  console.log("[Migration] Found old IndexedDB database, starting migration...")

  try {
    // 2. Dynamic imports to avoid bundling these if not needed
    const SQLiteESMFactory = (await import("wa-sqlite/dist/wa-sqlite-async.mjs")).default
    const { IDBMirrorVFS } = await import("wa-sqlite/src/examples/IDBMirrorVFS.js")
    const SQLite = await import("wa-sqlite/src/sqlite-api.js")

    const module = await SQLiteESMFactory()
    const sqlite3 = SQLite.Factory(module)
    const vfs = await IDBMirrorVFS.create(IDB_NAME, module)
    sqlite3.vfs_register(vfs, true)
    
    const dbSqlite3 = await sqlite3.open_v2(SQLITE_DB_NAME)

    const query = async (sql) => {
      const rows = []
      for await (const stmt of sqlite3.statements(dbSqlite3, sql)) {
        while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
          rows.push(sqlite3.row(stmt))
        }
      }
      return rows
    }

    // 3. Read data
    // Assuming table names are feeds, subscriptions, entries based on schemas
    const feeds = await query("SELECT * FROM feeds")
    const subscriptions = await query("SELECT * FROM subscriptions")
    const entries = await query("SELECT * FROM entries")

    console.log(`[Migration] Read ${feeds.length} feeds, ${subscriptions.length} subscriptions, ${entries.length} entries`)

    // 4. Send to Main Process
    const electron = window.electron
    if (electron?.ipcRenderer) {
      const result = await electron.ipcRenderer.invoke("migration.migrateFromRenderer", {
        feeds,
        subscriptions,
        entries
      })

      if (result.success) {
        console.log("[Migration] Migration successful! Deleting old IndexedDB...")
        await sqlite3.close(dbSqlite3)
        vfs.close()
        indexedDB.deleteDatabase(IDB_NAME)
      } else {
        console.error("[Migration] Main process failed to persist data:", result.error)
      }
    }
  } catch (error) {
    console.error("[Migration] Error during migration process:", error)
  }
}
