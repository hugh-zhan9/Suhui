import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type { PgRemoteDatabase } from "drizzle-orm/pg-proxy"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core/db"

import type * as schema from "./schemas"

export type LegacySqliteAsyncDb = BaseSQLiteDatabase<"async", any, typeof schema>
export type LegacySqliteSyncDb = BaseSQLiteDatabase<"sync", any, typeof schema>
export type LegacySqliteDB = LegacySqliteAsyncDb | LegacySqliteSyncDb

export type PostgresDB = NodePgDatabase<typeof schema> | PgRemoteDatabase<typeof schema>
export type DB = PostgresDB
