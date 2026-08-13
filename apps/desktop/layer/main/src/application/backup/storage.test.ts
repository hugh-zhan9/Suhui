import { beforeEach, describe, expect, it, vi } from "vitest"

const { connect, query, release } = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}))

vi.mock("@suhui/database/db.main", () => ({
  getMainPgPool: () => ({ connect }),
}))

import { PostgresBackupStorage } from "./storage"

describe("PostgresBackupStorage restore isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockResolvedValue({ rows: [] })
    connect.mockResolvedValue({ query, release })
  })

  it("waits for existing writes by locking restore tables before returning a transaction", async () => {
    const storage = new PostgresBackupStorage()

    const transaction = await storage.beginRestore()

    expect(query.mock.calls[0]?.[0]).toBe("BEGIN")
    expect(query.mock.calls[1]?.[0]).toMatch(/^LOCK TABLE /)
    expect(query.mock.calls[1]?.[0]).toContain('"entries"')
    expect(query.mock.calls[1]?.[0]).toContain('"entry_notes"')
    expect(query.mock.calls[1]?.[0]).toContain('"pending_sync_ops"')
    await transaction.rollback()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it("rolls back and releases the client when lock acquisition fails", async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("lock failed"))
    const storage = new PostgresBackupStorage()

    await expect(storage.beginRestore()).rejects.toThrow("lock failed")

    expect(query).toHaveBeenCalledWith("ROLLBACK")
    expect(release).toHaveBeenCalledTimes(1)
  })

  it("keeps active/read state and rejects older timestamped rows during merge", async () => {
    const transaction = await new PostgresBackupStorage().beginRestore("merge")
    await transaction.upsert([
      {
        type: "record",
        entity: "entries",
        key: '["entry-1"]',
        value: { id: "entry-1", read: false, deleted_at: 10 },
      },
    ])
    expect(query.mock.calls.at(-1)?.[0]).toContain('"entries"."read" IS TRUE')
    expect(query.mock.calls.at(-1)?.[0]).toContain('"entries"."deleted_at" IS NULL')

    await transaction.upsert([
      {
        type: "record",
        entity: "entry_notes",
        key: '["note-1"]',
        value: { id: "note-1", updated_at: 10, deleted_at: null },
      },
    ])
    expect(query.mock.calls.at(-1)?.[0]).toContain(
      'WHERE EXCLUDED."updated_at" >= "entry_notes"."updated_at"',
    )
    await transaction.rollback()
  })

  it("clears an interrupted cluster rebuild during replace restore", async () => {
    const transaction = await new PostgresBackupStorage().beginRestore("replace")

    await transaction.clear()

    expect(query).toHaveBeenCalledWith('DELETE FROM "content_cluster_rebuild_state"')
    await transaction.rollback()
  })
})
