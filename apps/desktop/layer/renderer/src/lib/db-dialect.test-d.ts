import type * as pgSchema from "@suhui/database/schemas/postgres"
import type { DB } from "@suhui/database/types"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type { PgRemoteDatabase } from "drizzle-orm/pg-proxy"
import { assertType, test } from "vitest"

type PostgresDb = NodePgDatabase<typeof pgSchema> | PgRemoteDatabase<typeof pgSchema>

test("DB type is postgres-only", () => {
  assertType<PostgresDb>({} as DB)
})
