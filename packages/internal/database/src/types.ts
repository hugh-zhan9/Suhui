import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core/db"

import type * as schema from "./schemas"

export type DB =
  | BaseSQLiteDatabase<"async", any, typeof schema>
  | BaseSQLiteDatabase<"sync", any, typeof schema>
  | NodePgDatabase<typeof schema>
