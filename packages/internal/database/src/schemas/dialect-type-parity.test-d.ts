import { describe, expectTypeOf, it } from "vitest"

import type * as pgSchema from "./postgres"
import type * as sqliteSchema from "./sqlite"

/**
 * D6：两个方言必须推导出相同的域类型，否则 schemas/types.ts 派生的
 * EntrySchema / FeedSchema 等会变成联合类型并级联到全仓库。
 *
 * 这里逐表断言 $inferSelect 与 $inferInsert 双向可赋值（即类型等价）。
 */
describe("两个方言的推导类型等价", () => {
  it("entries", () => {
    expectTypeOf<typeof sqliteSchema.entriesTable.$inferSelect>().toEqualTypeOf<
      typeof pgSchema.entriesTable.$inferSelect
    >()
    expectTypeOf<typeof sqliteSchema.entriesTable.$inferInsert>().toEqualTypeOf<
      typeof pgSchema.entriesTable.$inferInsert
    >()
  })

  it("feeds", () => {
    expectTypeOf<typeof sqliteSchema.feedsTable.$inferSelect>().toEqualTypeOf<
      typeof pgSchema.feedsTable.$inferSelect
    >()
  })

  it("subscriptions（含 boolean 列）", () => {
    expectTypeOf<typeof sqliteSchema.subscriptionsTable.$inferSelect>().toEqualTypeOf<
      typeof pgSchema.subscriptionsTable.$inferSelect
    >()
  })

  it("entry_rules（含三个 jsonb 列）", () => {
    expectTypeOf<typeof sqliteSchema.entryRulesTable.$inferSelect>().toEqualTypeOf<
      typeof pgSchema.entryRulesTable.$inferSelect
    >()
  })

  it("时间戳是 number 而不是 Date", () => {
    expectTypeOf<
      typeof sqliteSchema.entriesTable.$inferSelect.publishedAt
    >().toEqualTypeOf<number>()
    expectTypeOf<typeof sqliteSchema.entriesTable.$inferSelect.insertedAt>().toEqualTypeOf<number>()
  })

  // read 列没有 notNull，所以是 boolean | null；关键是它不能是 number
  it("read 是 boolean 而不是 number", () => {
    expectTypeOf<typeof sqliteSchema.entriesTable.$inferSelect.read>().toEqualTypeOf<
      boolean | null
    >()
    expectTypeOf<typeof sqliteSchema.entriesTable.$inferSelect.read>().toEqualTypeOf<
      typeof pgSchema.entriesTable.$inferSelect.read
    >()
  })

  it("jsonb 对应列保留 $type 标注的具体类型", () => {
    expectTypeOf<typeof sqliteSchema.entriesTable.$inferSelect.categories>().toEqualTypeOf<
      typeof pgSchema.entriesTable.$inferSelect.categories
    >()
  })

  it("新补的两张表也对齐", () => {
    expectTypeOf<typeof sqliteSchema.backupRestoreSettingsTable.$inferSelect>().toEqualTypeOf<
      typeof pgSchema.backupRestoreSettingsTable.$inferSelect
    >()
    expectTypeOf<typeof sqliteSchema.contentClusterRebuildStateTable.$inferSelect>().toEqualTypeOf<
      typeof pgSchema.contentClusterRebuildStateTable.$inferSelect
    >()
  })
})
