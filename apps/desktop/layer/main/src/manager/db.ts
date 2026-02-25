import { app } from "electron"
import { join } from "node:path"

import { initializeMainDB, migrateMainDB, getMainDB, getMainSqlite } from "@follow/database/db.main"

export class DBManager {
  public static async init() {
    // 决定 SQLite 文件放在用户的 appData 目录下
    const userDataPath = app.getPath("userData")
    const dbPath = join(userDataPath, "folo_local.db")
    
    console.log(`[DBManager] Initializing Main DB at: ${dbPath}`)
    initializeMainDB(dbPath)
    
    console.log(`[DBManager] Running DB migrations...`)
    await migrateMainDB()
    console.log(`[DBManager] DB initialized successfully!`)
  }

  public static getDB() {
    return getMainDB()
  }

  public static getSqlite() {
    return getMainSqlite()
  }
}
