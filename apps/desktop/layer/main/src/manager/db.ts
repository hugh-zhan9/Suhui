import { getMainDB, getMainPgPool, initializeMainDB, migrateMainDB } from "@suhui/database/db.main"
import { dialog } from "electron"

import { sleep } from "~/lib/utils"
import { logger } from "~/logger"

import type { DbType } from "./db-config"
import { buildPgConfig, resolveDbType } from "./db-config"
import { ensurePostgresDatabaseExists } from "./postgres-bootstrap"

const dbInitRetryDelayMs = 2000
const dbInitMaxAttempts = 30

export class DBManager {
  private static dialect: DbType = "postgres"
  private static initPromise: Promise<void> | null = null
  private static ready = false
  private static lastError: unknown = null
  private static backgroundMode = false
  private static lastAttempt = 0
  private static maxAttempts = dbInitMaxAttempts

  private static async runInit() {
    const dbType = resolveDbType(process.env)
    this.dialect = dbType

    let lastError: unknown

    for (let attempt = 1; attempt <= dbInitMaxAttempts; attempt++) {
      this.lastAttempt = attempt
      try {
        await ensurePostgresDatabaseExists(process.env)
        const pgConfig = buildPgConfig(process.env)
        await initializeMainDB({ type: "postgres", config: pgConfig })

        console.info(`[DBManager] Running DB migrations...`)
        await migrateMainDB()
        console.info(`[DBManager] DB initialized successfully!`)
        this.ready = true
        this.lastError = null
        return
      } catch (error) {
        lastError = error
        this.lastError = error
        logger.error("[DBManager] init attempt failed", {
          attempt,
          maxAttempts: dbInitMaxAttempts,
          error: error instanceof Error ? error.message : String(error),
        })

        if (attempt < dbInitMaxAttempts) {
          await sleep(dbInitRetryDelayMs)
        }
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError)
    if (!this.backgroundMode) {
      dialog.showErrorBox("数据库初始化失败", message)
    }
    throw new Error(`DB_INIT_FAILED: ${message}`)
  }

  public static init(options?: { background?: boolean }) {
    if (this.ready) {
      return Promise.resolve()
    }
    if (this.initPromise) {
      return this.initPromise
    }

    this.backgroundMode = options?.background ?? false
    this.initPromise = this.runInit()
      .catch((error) => {
        this.ready = false
        throw error
      })
      .finally(() => {
        this.initPromise = null
        this.backgroundMode = false
      })

    return this.initPromise
  }

  public static isReady() {
    return this.ready
  }

  public static async waitUntilReady() {
    if (this.ready) return
    if (!this.initPromise) {
      await this.init({ background: true })
      return
    }
    await this.initPromise
  }

  public static getLastError() {
    return this.lastError
  }

  public static getStatus() {
    return {
      ready: this.ready,
      initializing: !!this.initPromise,
      backgroundMode: this.backgroundMode,
      lastError: this.lastError instanceof Error ? this.lastError.message : this.lastError || null,
      lastAttempt: this.lastAttempt,
      maxAttempts: this.maxAttempts,
      dialect: this.dialect,
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
