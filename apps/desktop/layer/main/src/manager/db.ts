import {
  activateMainDB,
  closeMainDBHandles,
  createMainDBHandles,
  getActiveMainDBHandles,
  getMainDB,
  getMainPgPool,
  migrateMainDB,
} from "@suhui/database/db.main"
import { dialog } from "electron"

import { store, StoreKey } from "../lib/store"
import { sleep } from "../lib/utils"
import { logger } from "../logger"

import type { DbConfigOverride, DbType, EffectiveDbConfig } from "./db-config"
import {
  buildPgConfigFromResolved,
  normalizeDbConfigOverride,
  resolveEffectiveDbConfig,
  toDbEnv,
} from "./db-config"
import { ensurePostgresDatabaseExists } from "./postgres-bootstrap"

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
        await ensurePostgresDatabaseExists(toDbEnv(config))
        const handles = createMainDBHandles({
          type: "postgres",
          config: buildPgConfigFromResolved(config),
        })

        try {
          console.info("[DBManager] Running DB migrations...")
          await migrateMainDB(handles)
          await handles.pgPool.query("SELECT 1")
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

  private static async runInit() {
    const effectiveConfig = resolveEffectiveDbConfig({
      env: process.env,
      override: this.readPersistedOverride(),
    })
    this.dialect = effectiveConfig.dbType
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
  }

  public static getLastError() {
    return this.lastError
  }

  public static getStatus() {
    return {
      ready: this.ready,
      initializing: !!this.initPromise,
      switching: !!this.switchPromise,
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
        }).source,
    }
  }

  public static getEffectiveConfig() {
    return (
      this.activeConfig ??
      resolveEffectiveDbConfig({
        env: process.env,
        override: this.readPersistedOverride(),
      })
    )
  }

  public static registerCutoverParticipant(name: string, participant: DbCutoverParticipant) {
    this.cutoverParticipants.set(name, participant)
  }

  public static unregisterCutoverParticipant(name: string) {
    this.cutoverParticipants.delete(name)
  }

  private static async quiesceForCutover() {
    const quiesced: DbCutoverParticipant[] = []

    try {
      for (const participant of this.cutoverParticipants.values()) {
        await participant.quiesce?.()
        quiesced.push(participant)
      }
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

  public static getDB() {
    if (this.switchPromise) {
      throw new Error("Database switch in progress")
    }
    return getMainDB()
  }

  public static getPgPool() {
    if (this.switchPromise) {
      throw new Error("Database switch in progress")
    }
    return getMainPgPool()
  }

  public static getDialect() {
    return this.dialect
  }

  public static async switchDatabase(override: DbConfigOverride | null) {
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
    })
    const previousConfig =
      this.activeConfig ??
      resolveEffectiveDbConfig({
        env: process.env,
        override: this.readPersistedOverride(),
      })

    if (this.ready && this.configsEqual(previousConfig, nextConfig)) {
      const currentOverride = this.readPersistedOverride()
      const sameOverride =
        JSON.stringify(currentOverride ?? null) === JSON.stringify(normalizedOverride ?? null)
      if (sameOverride) {
        return Promise.resolve({ active: nextConfig })
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
