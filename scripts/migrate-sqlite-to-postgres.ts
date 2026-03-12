import {
  hasSqliteData,
  isPostgresEmpty,
  migrateSqliteToPostgres,
  parseMigrationArgs,
  resolveLegacySqlitePath,
} from "../apps/desktop/layer/main/src/manager/sqlite-postgres-migration"
import { buildPgConfig } from "../apps/desktop/layer/main/src/manager/db-config"
import { Pool } from "pg"

// eslint-disable-next-line @typescript-eslint/no-var-requires
const BetterSqlite3 = require("better-sqlite3")

type SqliteReader = {
  prepare: (sql: string) => { get?: (param?: unknown) => unknown; all?: () => unknown[] }
  close: () => void
}

const usage = (defaultSqlitePath: string) => `\
用法:
  pnpm tsx scripts/migrate-sqlite-to-postgres.ts [--sqlite-path <path>] [--postgres-url <url>]

参数:
  --sqlite-path   覆盖默认 SQLite 路径
  --postgres-url  直接指定 Postgres 连接串（优先于 DB_CONN 等环境变量）
  --help          显示帮助

默认 SQLite 路径:
  ${defaultSqlitePath}
`

const run = async () => {
  const args = parseMigrationArgs(process.argv.slice(2))
  const defaultSqlitePath = resolveLegacySqlitePath()

  if (args.help) {
    console.info(usage(defaultSqlitePath))
    return
  }

  const sqlitePath = args.sqlitePath ?? defaultSqlitePath
  const pgConfig = args.postgresUrl
    ? { connectionString: args.postgresUrl }
    : buildPgConfig(process.env)

  const pool = new Pool(pgConfig)
  try {
    const sqliteFactory = (path: string) =>
      new BetterSqlite3(path, { readonly: true }) as unknown as SqliteReader

    if (!hasSqliteData(sqlitePath, sqliteFactory)) {
      console.info(`[迁移] 未发现 SQLite 数据: ${sqlitePath}`)
      return
    }

    const postgresEmpty = await isPostgresEmpty(pool)
    if (!postgresEmpty) {
      throw new Error("Postgres 已存在数据，已中止迁移。请先清空目标库或选择新库。")
    }

    console.info(`[迁移] 开始迁移: ${sqlitePath}`)
    await migrateSqliteToPostgres(sqlitePath, pool, sqliteFactory)
    console.info("[迁移] SQLite -> Postgres 完成")
  } finally {
    await pool.end()
  }
}

run().catch((error) => {
  const defaultSqlitePath = resolveLegacySqlitePath()
  console.error(`[迁移] 失败: ${error instanceof Error ? error.message : String(error)}`)
  console.info(usage(defaultSqlitePath))
  process.exitCode = 1
})
