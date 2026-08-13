import { describe, expect, it, vi } from "vitest"

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => ({ mocked: true })),
}))

const poolOn = vi.fn()
const poolQuery = vi.fn()

vi.mock("pg", () => ({
  Pool: vi.fn(() => ({
    on: poolOn,
    query: poolQuery,
  })),
}))

describe("main postgres db handles", () => {
  it("registers a pool error listener for idle connection failures", async () => {
    const { createMainDBHandles } = await import("./db.main")

    createMainDBHandles({
      type: "postgres",
      config: {
        host: "127.0.0.1",
        port: 5431,
        database: "suhui",
      },
    })

    expect(poolOn).toHaveBeenCalledWith("error", expect.any(Function))
  })

  it("creates the local reading workflow tables idempotently", async () => {
    const { createMainDBHandles, migrateMainDB } = await import("./db.main")
    const handles = createMainDBHandles({
      type: "postgres",
      config: { database: "suhui" },
    })

    await migrateMainDB(handles)

    const statements = poolQuery.mock.calls.map(([statement]) => statement as string).join("\n")
    for (const table of [
      "content_clusters",
      "content_cluster_members",
      "content_cluster_exclusions",
      "entry_rules",
      "entry_rule_applications",
      "entry_user_state",
      "entry_tags",
      "entry_notes",
      "entry_highlights",
      "reading_queue",
      "backup_restore_settings",
      "content_cluster_rebuild_state",
    ]) {
      expect(statements).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }
    expect(statements).toContain("primary key (rule_id, entry_id, rule_version)")
    expect(statements).toContain("primary key (entry_id, tag)")
    expect(statements).toContain("ALTER TABLE summaries ALTER COLUMN language SET NOT NULL")
  })
})
