import { AsyncLocalStorage } from "node:async_hooks"

import {
  activateMainDB,
  closeMainDBHandles,
  createMainDBHandles,
  getActiveMainDBHandles,
  getMainDB,
  getMainPgPool,
  migrateMainDB,
} from "@suhui/database/db.main"
import { setRuntimeDbType } from "@suhui/database/schemas/runtime"
import { app, dialog } from "electron"
import { join } from "pathe"

import { store, StoreKey } from "../lib/store"
import { sleep } from "../lib/utils"
import { logger } from "../logger"
import type { DbConfigOverride, DbType, EffectiveDbConfig } from "./db-config"
import {
  buildPgConfigFromResolved,
  buildSqliteConfigFromResolved,
  normalizeDbConfigOverride,
  resolveEffectiveDbConfig,
  toDbEnv,
} from "./db-config"
import { ensurePostgresDatabaseExists } from "./postgres-bootstrap"
import { ensureSqliteDatabaseDirectory } from "./sqlite-bootstrap"

/** SQLite 默认落在 userData 下，与 .env / db.json 同一目录（见 plan 的 D2）。 */
const defaultSqliteFileName = "suhui.db"
const resolveDefaultSqlitePath = () => join(app.getPath("userData"), defaultSqliteFileName)

const dbInitRetryDelayMs = 2000
const dbInitMaxAttempts = 30
const dbSwitchMaxAttempts = 1

type DbCutoverParticipant = {
  quiesce?: () => Promise<void> | void
  resume?: () => Promise<void> | void
}

export class DBManager {
  private static dialect: DbType = "postgres"
  private static initPromise: Promise<void> | null = null
  private static switchPromise: Promise<{ active: EffectiveDbConfig }> | null = null
  private static ready = false
  private static lastError: unknown = null
  private static backgroundMode = false
  private static lastAttempt = 0
  private static maxAttempts = dbInitMaxAttempts
  private static activeConfig: EffectiveDbConfig | null = null
  private static cutoverParticipants = new Map<string, DbCutoverParticipant>()
  private static maintenancePromise: Promise<void> | null = null
  private static activeOperations = 0
  private static activeOperationWaiters = new Set<() => void>()
  private static activeOperationContext = new AsyncLocalStorage<boolean>()

  private static readPersistedOverride() {
    return normalizeDbConfigOverride(
      (store.get(StoreKey.DbConfigOverride) as DbConfigOverride | null | undefined) ?? null,
    )
  }

  private static configsEqual(
    left: EffectiveDbConfig | null | undefined,
    right: EffectiveDbConfig | null | undefined,
  ) {
    if (!left || !right) return false
    return (
      left.dbConn === right.dbConn &&
      left.dbUser === right.dbUser &&
      left.dbPassword === right.dbPassword &&
      left.source === right.source
    )
  }

  private static async prepareDatabaseTarget(config: EffectiveDbConfig, maxAttempts: number) {
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.lastAttempt = attempt
      try {
        const handles = await this.createCandidateHandles(config)

        try {
          console.info("[DBManager] Running DB migrations...", { dialect: config.dbType })
          await migrateMainDB(handles)
          await this.probeHandles(handles)
          return handles
        } catch (error) {
          try {
            await closeMainDBHandles(handles)
          } catch (closeError) {
            logger.warn("[DBManager] failed to close candidate handles", {
              error: closeError instanceof Error ? closeError.message : String(closeError),
            })
          }
          throw error
        }
      } catch (error) {
        lastError = error
        this.lastError = error
        logger.error("[DBManager] init attempt failed", {
          attempt,
          maxAttempts,
          error: error instanceof Error ? error.message : String(error),
        })

        if (attempt < maxAttempts) {
          await sleep(dbInitRetryDelayMs)
        }
      }
    }

    throw lastError
  }

  /** 按方言创建候选连接。sqlite 只需确保父目录存在，postgres 需要先建库。 */
  private static async createCandidateHandles(config: EffectiveDbConfig) {
    if (config.dbType === "sqlite") {
      const sqliteConfig = buildSqliteConfigFromResolved(config)
      ensureSqliteDatabaseDirectory(sqliteConfig.filePath)
      return createMainDBHandles({ type: "sqlite", config: sqliteConfig })
    }

    await ensurePostgresDatabaseExists(toDbEnv(config))
    return createMainDBHandles({
      type: "postgres",
      config: buildPgConfigFromResolved(config),
    })
  }

  /** 连通性探针：postgres 走 SELECT 1，sqlite 读一次账本表。 */
  private static async probeHandles(
    handles: Awaited<ReturnType<typeof this.createCandidateHandles>>,
  ) {
    if (handles.type === "sqlite") {
      handles.sqlite.prepare("select 1").all()
      return
    }
    await handles.pgPool.query("SELECT 1")
  }

  private static async runInit() {
    const effectiveConfig = resolveEffectiveDbConfig({
      env: process.env,
      override: this.readPersistedOverride(),
      defaultSqlitePath: resolveDefaultSqlitePath(),
    })
    this.dialect = effectiveConfig.dbType
    setRuntimeDbType(effectiveConfig.dbType)
    let initError: unknown

    try {
      const handles = await this.prepareDatabaseTarget(effectiveConfig, dbInitMaxAttempts)
      activateMainDB(handles)
      console.info("[DBManager] DB initialized successfully!")
      this.ready = true
      this.activeConfig = effectiveConfig
      this.lastError = null
      return
    } catch (error) {
      initError = error
      const activeHandles = getActiveMainDBHandles()
      if (activeHandles) {
        try {
          await closeMainDBHandles(activeHandles)
        } catch {}
      }
    }

    const message = initError instanceof Error ? initError.message : String(initError)
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

  public static async waitUntilUsable() {
    await this.waitUntilReady()
    if (this.switchPromise) {
      await this.switchPromise
    }
    if (this.maintenancePromise) {
      await this.maintenancePromise
    }
  }

  public static getLastError() {
    return this.lastError
  }

  public static getStatus() {
    return {
      ready: this.ready,
      initializing: !!this.initPromise,
      switching: !!this.switchPromise,
      maintenance: !!this.maintenancePromise,
      backgroundMode: this.backgroundMode,
      lastError: this.lastError instanceof Error ? this.lastError.message : this.lastError || null,
      lastAttempt: this.lastAttempt,
      maxAttempts: this.maxAttempts,
      dialect: this.dialect,
      configSource:
        this.activeConfig?.source ??
        resolveEffectiveDbConfig({
          env: process.env,
          override: this.readPersistedOverride(),
          defaultSqlitePath: resolveDefaultSqlitePath(),
        }).source,
    }
  }

  /** SQLite 的默认库文件路径（应用数据目录），转换到 sqlite 时作为目标地址。 */
  public static getDefaultSqlitePath() {
    return resolveDefaultSqlitePath()
  }

  public static getEffectiveConfig() {
    return (
      this.activeConfig ??
      resolveEffectiveDbConfig({
        env: process.env,
        override: this.readPersistedOverride(),
        defaultSqlitePath: resolveDefaultSqlitePath(),
      })
    )
  }

  public static registerCutoverParticipant(name: string, participant: DbCutoverParticipant) {
    this.cutoverParticipants.set(name, participant)
  }

  public static unregisterCutoverParticipant(name: string) {
    this.cutoverParticipants.delete(name)
  }

  public static async runTrackedOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activeOperationContext.getStore()) return operation()
    if (this.switchPromise || this.maintenancePromise) {
      throw new Error(
        this.maintenancePromise
          ? "Database maintenance in progress"
          : "Database switch in progress",
      )
    }
    this.activeOperations += 1
    try {
      return await this.activeOperationContext.run(true, operation)
    } finally {
      this.activeOperations -= 1
      if (this.activeOperations === 0) {
        for (const resolve of this.activeOperationWaiters) resolve()
        this.activeOperationWaiters.clear()
      }
    }
  }

  private static waitForTrackedOperations() {
    if (this.activeOperations === 0) return Promise.resolve()
    return new Promise<void>((resolve) => this.activeOperationWaiters.add(resolve))
  }

  private static async quiesceForCutover() {
    const quiesced: DbCutoverParticipant[] = []

    try {
      for (const participant of this.cutoverParticipants.values()) {
        await participant.quiesce?.()
        quiesced.push(participant)
      }
      await this.waitForTrackedOperations()
    } catch (error) {
      await Promise.allSettled(
        quiesced.reverse().map(async (participant) => {
          await participant.resume?.()
        }),
      )
      throw error
    }

    return async () => {
      await Promise.allSettled(
        quiesced.reverse().map(async (participant) => {
          await participant.resume?.()
        }),
      )
    }
  }

  public static async beginMaintenance() {
    if (this.maintenancePromise) throw new Error("Database maintenance in progress")
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    this.maintenancePromise = gate
    let resume: () => Promise<void>
    try {
      await this.waitUntilReady()
      if (this.switchPromise) await this.switchPromise
      resume = await this.quiesceForCutover()
    } catch (error) {
      if (this.maintenancePromise === gate) this.maintenancePromise = null
      release()
      throw error
    }
    let finished = false
    return async () => {
      if (finished) return
      finished = true
      try {
        await resume()
      } finally {
        if (this.maintenancePromise === gate) this.maintenancePromise = null
        release()
      }
    }
  }

  public static getDB() {
    if (this.switchPromise || this.maintenancePromise) {
      throw new Error(
        this.maintenancePromise
          ? "Database maintenance in progress"
          : "Database switch in progress",
      )
    }
    return getMainDB()
  }

  public static getPgPool() {
    if (this.switchPromise || this.maintenancePromise) {
      throw new Error(
        this.maintenancePromise
          ? "Database maintenance in progress"
          : "Database switch in progress",
      )
    }
    return getMainPgPool()
  }

  public static getDialect() {
    return this.dialect
  }

  public static async switchDatabase(override: DbConfigOverride | null) {
    if (this.maintenancePromise) throw new Error("Database maintenance in progress")
    if (this.initPromise) {
      try {
        await this.initPromise
      } catch {
        // Let explicit switch retry with the candidate config below.
      }
    }

    if (this.switchPromise) {
      return this.switchPromise
    }

    const normalizedOverride = normalizeDbConfigOverride(override)
    const nextConfig = resolveEffectiveDbConfig({
      env: process.env,
      override: normalizedOverride,
      defaultSqlitePath: resolveDefaultSqlitePath(),
    })
    const previousConfig =
      this.activeConfig ??
      resolveEffectiveDbConfig({
        env: process.env,
        override: this.readPersistedOverride(),
        defaultSqlitePath: resolveDefaultSqlitePath(),
      })

    if (this.ready && this.configsEqual(previousConfig, nextConfig)) {
      const currentOverride = this.readPersistedOverride()
      const sameOverride =
        JSON.stringify(currentOverride ?? null) === JSON.stringify(normalizedOverride ?? null)
      if (sameOverride) {
        return { active: nextConfig }
      }
    }

    this.switchPromise = this.performSwitch(nextConfig, normalizedOverride).finally(() => {
      this.switchPromise = null
    })
    return this.switchPromise
  }

  private static async performSwitch(
    nextConfig: EffectiveDbConfig,
    persistedOverride: DbConfigOverride | null,
  ) {
    const previousHandles = getActiveMainDBHandles()
    const previousOverride = this.readPersistedOverride()
    const previousReady = this.ready
    const previousConfig = this.activeConfig
    // dialect 此前只在成功路径赋值、失败路径不恢复；DbType 有两个取值后这会
    // 让失败的切换留下与真实库不符的方言上报。
    const previousDialect = this.dialect
    const candidateHandles = await this.prepareDatabaseTarget(nextConfig, dbSwitchMaxAttempts)
    const resume = await this.quiesceForCutover()

    try {
      if (persistedOverride) {
        store.set(StoreKey.DbConfigOverride, persistedOverride)
      } else {
        store.delete(StoreKey.DbConfigOverride)
      }

      activateMainDB(candidateHandles)
      this.ready = true
      this.activeConfig = nextConfig
      this.dialect = nextConfig.dbType
      setRuntimeDbType(nextConfig.dbType)
      this.lastError = null
      await resume()
    } catch (error) {
      if (previousOverride) {
        store.set(StoreKey.DbConfigOverride, previousOverride)
      } else {
        store.delete(StoreKey.DbConfigOverride)
      }

      if (previousHandles) {
        activateMainDB(previousHandles)
      }

      this.ready = previousReady
      this.activeConfig = previousConfig ?? null
      this.dialect = previousDialect
      setRuntimeDbType(previousDialect)
      this.lastError = error

      try {
        await closeMainDBHandles(candidateHandles)
      } catch {}
      try {
        await resume()
      } catch {}
      throw error
    }

    if (previousHandles && previousHandles !== candidateHandles) {
      try {
        await closeMainDBHandles(previousHandles)
      } catch (error) {
        logger.warn("[DBManager] failed to close previous database handles", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return { active: nextConfig }
  }
}
