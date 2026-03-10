import {
  getMainDB,
  getMainPgPool,
  getMainSqlite,
  initializeMainDB,
  migrateMainDB,
} from "@follow/database/db.main"
import { app, dialog } from "electron"
import { join } from "pathe"

import type { DbType } from "./db-config"
import { buildPgConfig, resolveDbType } from "./db-config"

export class DBManager {
  private static dialect: DbType = "sqlite"

  public static async init() {
    const dbType = resolveDbType(process.env)
    this.dialect = dbType

    try {
      if (dbType === "postgres") {
        const pgConfig = buildPgConfig(process.env)
        await initializeMainDB({ type: "postgres", config: pgConfig })
      } else {
        const userDataPath = app.getPath("userData")
        const dbPath = join(userDataPath, "suhui_local.db")

        console.info(`[DBManager] Initializing Main DB at: ${dbPath}`)
        initializeMainDB({ type: "sqlite", dbPath })
      }

      console.info(`[DBManager] Running DB migrations...`)
      await migrateMainDB(dbType)
      console.info(`[DBManager] DB initialized successfully!`)
    } catch (error: any) {
      dialog.showErrorBox("数据库初始化失败", error?.message || String(error))
      app.exit(1)
    }
  }

  public static getDB() {
    return getMainDB()
  }

  public static getSqlite() {
    return getMainSqlite()
  }

  public static getPgPool() {
    return getMainPgPool()
  }

  public static getDialect() {
    return this.dialect
  }
}
