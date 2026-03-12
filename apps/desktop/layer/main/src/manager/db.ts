import { getMainDB, getMainPgPool, initializeMainDB, migrateMainDB } from "@suhui/database/db.main"
import { app, dialog } from "electron"

import type { DbType } from "./db-config"
import { buildPgConfig, resolveDbType } from "./db-config"
import { ensurePostgresDatabaseExists } from "./postgres-bootstrap"

export class DBManager {
  private static dialect: DbType = "postgres"

  public static async init() {
    const dbType = resolveDbType(process.env)
    this.dialect = dbType

    try {
      await ensurePostgresDatabaseExists(process.env)
      const pgConfig = buildPgConfig(process.env)
      await initializeMainDB({ type: "postgres", config: pgConfig })

      console.info(`[DBManager] Running DB migrations...`)
      await migrateMainDB()
      console.info(`[DBManager] DB initialized successfully!`)
    } catch (error: any) {
      dialog.showErrorBox("数据库初始化失败", error?.message || String(error))
      app.exit(1)
    }
  }

  public static getDB() {
    return getMainDB()
  }

  public static getPgPool() {
    return getMainPgPool()
  }

  public static getDialect() {
    return this.dialect
  }
}
