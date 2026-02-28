import { sql } from "drizzle-orm"
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const appliedSyncOpsTable = sqliteTable("applied_sync_ops", {
  opId: text("op_id").primaryKey(),
  appliedAt: integer("applied_at", { mode: "timestamp_ms" }).notNull(),
})

export const pendingSyncOpsTable = sqliteTable("pending_sync_ops", {
  opId: text("op_id").primaryKey(),
  opJson: text("op_json").notNull(),
  retryAfter: integer("retry_after", { mode: "timestamp_ms" }).notNull().default(sql`0`),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status").$type<"pending" | "expired" | "failed" | "applied">().notNull().default("pending"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  appliedAt: integer("applied_at", { mode: "timestamp_ms" }),
})
