import type { PgRemoteDatabase } from "drizzle-orm/pg-proxy"

import { migrateFromIndexedDB } from "./migrate-indexed-db"
import * as schema from "./schemas"
import { setRuntimeDbType } from "./schemas/runtime"
import * as sqliteSchema from "./schemas/sqlite"

/**
 * 渲染层不直连数据库，SQL 经 IPC 交给主进程执行；但**生成** SQL 的方言必须与
 * 主进程一致：postgres 用 `$n` 占位符，sqlite 用 `?`。两个 schema 逐列产出相同
 * 的 JS 类型（见 plan 的 D6），故对外仍暴露单一类型。
 */
export let db: PgRemoteDatabase<typeof schema>
export const SKIP_NEXT_INDEXED_DB_MIGRATION_KEY = "follow:skip-next-indexeddb-migration"

export const scheduleSkipNextIndexedDbMigration = () => {
  globalThis.sessionStorage?.setItem(SKIP_NEXT_INDEXED_DB_MIGRATION_KEY, "1")
}

const consumeSkipNextIndexedDbMigration = () => {
  const shouldSkip = globalThis.sessionStorage?.getItem(SKIP_NEXT_INDEXED_DB_MIGRATION_KEY) === "1"
  if (shouldSkip) {
    globalThis.sessionStorage?.removeItem(SKIP_NEXT_INDEXED_DB_MIGRATION_KEY)
  }
  return shouldSkip
}

/**
 * 向主进程询问当前方言。取不到时按 postgres 处理——那是接线完成前的既有行为。
 */
const resolveMainDialect = async (electron: {
  ipcRenderer: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
}): Promise<"postgres" | "sqlite"> => {
  try {
    const dialect = await electron.ipcRenderer.invoke("db.getDialect")
    return dialect === "sqlite" ? "sqlite" : "postgres"
  } catch (error) {
    console.warn("[Local-First] failed to resolve db dialect, assuming postgres", error)
    return "postgres"
  }
}

export async function initializeDB() {
  const { electron } = window as any
  if (!electron || !electron.ipcRenderer) {
    console.warn("[Local-First] IPC Renderer not found. Backend DB may not be accessible.")
    return
  }

  // Start migration in background (don't block initial load if possible,
  // but better to run before the first query? Actually hydrate will run later)
  if (!consumeSkipNextIndexedDbMigration()) {
    void migrateFromIndexedDB()
  }

  const dialect = await resolveMainDialect(electron)
  // 渲染层也要按方言重绑表对象：这里构造的 SQL 与参数直接送到主进程执行，
  // 拿 Postgres 的表去生成 sqlite 语句会把 boolean 原样当参数绑过去。
  setRuntimeDbType(dialect)

  const invoke = async (sql: string, params: unknown[], method: string) => {
    try {
      return await electron.ipcRenderer.invoke("db.executeRawSql", sql, params, method)
    } catch (error) {
      console.error(`[IPC DB Proxy] Error executing SQL: ${sql} with params:${params}`, error)
      return { rows: [] }
    }
  }

  if (dialect === "sqlite") {
    const { drizzle } = await import("drizzle-orm/sqlite-proxy")
    // sqlite-proxy 传来的 method 已是 run/all/get/values，直接透传
    db = drizzle(async (sql, params, method) => invoke(sql, params, method), {
      schema: sqliteSchema,
      logger: false,
    }) as unknown as PgRemoteDatabase<typeof schema>
    return
  }

  const { drizzle } = await import("drizzle-orm/pg-proxy")
  db = drizzle(
    // pg-proxy 只给 execute/all，需映射到主进程的 run/all
    async (sql, params, method) => invoke(sql, params, method === "execute" ? "run" : "all"),
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
