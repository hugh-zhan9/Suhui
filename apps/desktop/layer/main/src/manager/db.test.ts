import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@suhui/database/db.main", () => ({
  activateMainDB: vi.fn(),
  closeMainDBHandles: vi.fn(),
  createMainDBHandles: vi.fn(),
  getActiveMainDBHandles: vi.fn(),
  getMainDB: vi.fn(),
  getMainPgPool: vi.fn(),
  initializeMainDB: vi.fn(),
  migrateMainDB: vi.fn(),
}))

vi.mock("electron", () => ({
  dialog: {
    showErrorBox: vi.fn(),
  },
}))

vi.mock("~/lib/store", () => ({
  StoreKey: {
    DbConfigOverride: "dbConfigOverride",
  },
  store: {
    delete: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}))

vi.mock("~/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock("./postgres-bootstrap", () => ({
  ensurePostgresDatabaseExists: vi.fn(),
}))

import { buildPgConfig } from "./db-config"
import { DBManager } from "./db"
import { StoreKey, store } from "~/lib/store"
import {
  activateMainDB,
  closeMainDBHandles,
  createMainDBHandles,
  getActiveMainDBHandles,
  migrateMainDB,
} from "@suhui/database/db.main"
import { ensurePostgresDatabaseExists } from "./postgres-bootstrap"

describe("db manager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(DBManager as any).ready = false
    ;(DBManager as any).initPromise = null
    ;(DBManager as any).switchPromise = null
    ;(DBManager as any).lastError = null
    ;(DBManager as any).lastAttempt = 0
    ;(DBManager as any).backgroundMode = false
    ;(DBManager as any).activeConfig = null
    ;(DBManager as any).cutoverParticipants = new Map()
  })

  it("defaults to postgres dialect", () => {
    expect(DBManager.getDialect()).toBe("postgres")
  })

  it("builds postgres config from env", () => {
    const config = buildPgConfig({
      DB_TYPE: "postgres",
      DB_CONN: "127.0.0.1:5432/suhui",
      DB_USER: "u",
      DB_PASSWORD: "p",
    })
    expect(config).toMatchObject({
      host: "127.0.0.1",
      port: 5432,
      database: "suhui",
      user: "u",
      password: "p",
      connectionTimeoutMillis: 5000,
    })
  })

  it("keeps the old database active when candidate bootstrap fails", async () => {
    const oldHandles = { db: { name: "old-db" }, pgPool: { query: vi.fn() } }
    const candidateHandles = { db: { name: "candidate-db" }, pgPool: { query: vi.fn() } }

    vi.mocked(store.get).mockReturnValue(null)
    vi.mocked(getActiveMainDBHandles).mockReturnValue(oldHandles as any)
    vi.mocked(createMainDBHandles).mockReturnValue(candidateHandles as any)
    vi.mocked(migrateMainDB).mockRejectedValue(new Error("candidate migrate failed"))
    ;(DBManager as any).ready = true
    ;(DBManager as any).activeConfig = {
      dbType: "postgres",
      dbConn: "127.0.0.1:5432/active_db",
      dbUser: "active_user",
      dbPassword: "active_pass",
      source: "env",
    }

    await expect(
      DBManager.switchDatabase({
        dbConn: "127.0.0.1:5432/candidate_db",
        dbUser: "candidate_user",
        dbPassword: "candidate_pass",
      }),
    ).rejects.toThrow("candidate migrate failed")

    expect(ensurePostgresDatabaseExists).toHaveBeenCalledWith({
      DB_CONN: "127.0.0.1:5432/candidate_db",
      DB_PASSWORD: "candidate_pass",
      DB_USER: "candidate_user",
    })
    expect(store.set).not.toHaveBeenCalled()
    expect(store.delete).not.toHaveBeenCalled()
    expect(activateMainDB).not.toHaveBeenCalled()
    expect(closeMainDBHandles).toHaveBeenCalledWith(candidateHandles)
    expect((DBManager as any).activeConfig.dbConn).toBe("127.0.0.1:5432/active_db")
  })

  it("persists override and swaps handles only after candidate validation succeeds", async () => {
    const quiesce = vi.fn()
    const resume = vi.fn()
    const oldHandles = {
      db: { name: "old-db" },
      pgPool: { end: vi.fn(), query: vi.fn() },
    }
    const candidateHandles = {
      db: { name: "candidate-db" },
      pgPool: {
        end: vi.fn(),
        query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
      },
    }

    vi.mocked(store.get).mockReturnValue(null)
    vi.mocked(getActiveMainDBHandles).mockReturnValue(oldHandles as any)
    vi.mocked(createMainDBHandles).mockReturnValue(candidateHandles as any)
    vi.mocked(migrateMainDB).mockResolvedValue(undefined)

    DBManager.registerCutoverParticipant("background-jobs", {
      quiesce,
      resume,
    })

    const result = await DBManager.switchDatabase({
      dbConn: "127.0.0.1:5432/candidate_db",
      dbUser: "candidate_user",
      dbPassword: "candidate_pass",
    })

    expect(result.active.dbConn).toBe("127.0.0.1:5432/candidate_db")
    expect(quiesce).toHaveBeenCalledTimes(1)
    expect(store.set).toHaveBeenCalledWith(StoreKey.DbConfigOverride, {
      dbConn: "127.0.0.1:5432/candidate_db",
      dbPassword: "candidate_pass",
      dbUser: "candidate_user",
    })
    expect(activateMainDB).toHaveBeenCalledWith(candidateHandles)
    expect(closeMainDBHandles).toHaveBeenCalledWith(oldHandles)
    expect(resume).toHaveBeenCalledTimes(1)

    const storeSetMock = store.set as unknown as ReturnType<typeof vi.fn>

    expect(quiesce.mock.invocationCallOrder[0]).toBeLessThan(
      storeSetMock.mock.invocationCallOrder[0],
    )
    expect(storeSetMock.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(activateMainDB).mock.invocationCallOrder[0],
    )
  })

  it("blocks direct DB access while a switch is in progress", () => {
    ;(DBManager as any).switchPromise = Promise.resolve({
      active: {
        dbType: "postgres",
        dbConn: "127.0.0.1:5432/switched",
        dbUser: "postgres",
        dbPassword: "",
        source: "store-override",
      },
    })

    expect(() => DBManager.getDB()).toThrow("Database switch in progress")
    expect(() => DBManager.getPgPool()).toThrow("Database switch in progress")
  })
})
