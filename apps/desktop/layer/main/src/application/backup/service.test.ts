import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("~/lib/store", () => ({ store: {} }))

import type { BackupRecord } from "./format"
import { BackupApplicationService } from "./service"
import type { BackupRestoreTransaction, BackupStorage } from "./storage"

class MemoryStorage implements BackupStorage {
  records: BackupRecord[]
  clearCalls = 0
  commitCalls = 0
  rollbackCalls = 0
  failUpsert = false
  failCommit = false
  pendingSettings: Record<string, unknown> | null = null
  mainSettingsApplied = false
  rendererSettingsApplied = false

  constructor(records: BackupRecord[]) {
    this.records = records
  }

  async *streamRecords() {
    yield* this.records
  }

  async beginRestore(): Promise<BackupRestoreTransaction> {
    const staged = [...this.records]
    let stagedSettings = this.pendingSettings
    return {
      clear: async () => {
        this.clearCalls += 1
        staged.length = 0
      },
      upsert: async (records) => {
        if (this.failUpsert) throw new Error("injected restore failure")
        for (const record of records) {
          const index = staged.findIndex(
            (candidate) => candidate.entity === record.entity && candidate.key === record.key,
          )
          if (index >= 0) staged[index] = record
          else staged.push(record)
        }
      },
      stageSettings: async (settings) => {
        stagedSettings = settings
      },
      commit: async () => {
        if (this.failCommit) throw new Error("injected commit failure")
        this.commitCalls += 1
        this.records = staged
        this.pendingSettings = stagedSettings
        this.mainSettingsApplied = false
        this.rendererSettingsApplied = false
      },
      rollback: async () => {
        this.rollbackCalls += 1
      },
    }
  }

  async readPendingSettings(target: "main" | "renderer") {
    if (target === "main" && this.mainSettingsApplied) return null
    if (target === "renderer" && this.rendererSettingsApplied) return null
    return this.pendingSettings
  }

  async markSettingsApplied(target: "main" | "renderer") {
    if (target === "main") this.mainSettingsApplied = true
    else this.rendererSettingsApplied = true
  }
}

const temporaryDirectories: string[] = []
const makeTemporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), "suhui-backup-test-"))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

const feedRecord = (id: string): BackupRecord => ({
  type: "record",
  entity: "feeds",
  key: JSON.stringify([id]),
  value: { id, url: `https://example.com/${id}.xml` },
})

describe("BackupApplicationService", () => {
  it("merge restore upserts without deleting unrelated records", async () => {
    const directory = await makeTemporaryDirectory()
    const source = new MemoryStorage([feedRecord("source")])
    const target = new MemoryStorage([feedRecord("target")])
    const sourceSettings = { value: { appearance: "dark" as const } }
    const sourceService = new BackupApplicationService({
      storage: source,
      settings: {
        read: () => sourceSettings.value,
        write: (value) => (sourceSettings.value = value as any),
      },
    })
    const path = join(directory, "backup.suhui-backup")
    await sourceService.exportToFile(path)

    const targetSettings = {
      value: { appearance: "light" as const, rsshubCustomUrl: "https://rsshub.example" },
    }
    const targetService = new BackupApplicationService({
      storage: target,
      settings: {
        read: () => targetSettings.value,
        write: (value) => (targetSettings.value = value as any),
      },
    })
    await targetService.restoreFromFile({ path, mode: "merge" })

    expect(target.records.map((record) => record.key)).toEqual([
      JSON.stringify(["target"]),
      JSON.stringify(["source"]),
    ])
    expect(target.clearCalls).toBe(0)
    expect(targetSettings.value).toEqual({
      appearance: "dark",
      rsshubCustomUrl: "https://rsshub.example",
    })
  })

  it("requires a one-use confirmation and creates a snapshot before replace", async () => {
    const directory = await makeTemporaryDirectory()
    const path = join(directory, "backup.suhui-backup")
    const source = new MemoryStorage([feedRecord("source")])
    const settings = { value: {} }
    await new BackupApplicationService({
      storage: source,
      settings: { read: () => settings.value, write: (value) => (settings.value = value) },
    }).exportToFile(path)

    const target = new MemoryStorage([feedRecord("target")])
    const service = new BackupApplicationService({
      storage: target,
      safetySnapshotDirectory: join(directory, "snapshots"),
      settings: { read: () => settings.value, write: (value) => (settings.value = value) },
    })
    await expect(service.restoreFromFile({ path, mode: "replace" })).rejects.toThrow("confirmation")
    const prepared = await service.prepareReplace(path)
    const result = await service.restoreFromFile({
      path,
      mode: "replace",
      confirmationToken: prepared.token,
    })

    expect(target.clearCalls).toBe(1)
    expect(target.records).toEqual([feedRecord("source")])
    expect(result.snapshotPath).toBeTruthy()
    await expect(readFile(result.snapshotPath!, "utf8")).resolves.toContain("suhui-backup")
    await expect(
      service.restoreFromFile({ path, mode: "replace", confirmationToken: prepared.token }),
    ).rejects.toThrow("confirmation")
  })

  it("rolls back a failed replace and keeps the safety snapshot", async () => {
    const directory = await makeTemporaryDirectory()
    const path = join(directory, "backup.suhui-backup")
    const source = new MemoryStorage([feedRecord("source")])
    const settings = { value: {} }
    await new BackupApplicationService({
      storage: source,
      settings: { read: () => settings.value, write: (value) => (settings.value = value) },
    }).exportToFile(path)

    const target = new MemoryStorage([feedRecord("target")])
    target.failUpsert = true
    const service = new BackupApplicationService({
      storage: target,
      safetySnapshotDirectory: join(directory, "snapshots"),
      settings: { read: () => settings.value, write: (value) => (settings.value = value) },
    })
    const prepared = await service.prepareReplace(path)

    await expect(
      service.restoreFromFile({
        path,
        mode: "replace",
        confirmationToken: prepared.token,
      }),
    ).rejects.toThrow("injected restore failure")
    expect(target.records).toEqual([feedRecord("target")])
    expect(target.rollbackCalls).toBe(1)
  })

  it("does not replace an existing target when a record exceeds the import line limit", async () => {
    const directory = await makeTemporaryDirectory()
    const path = join(directory, "backup.suhui-backup")
    await import("node:fs/promises").then(({ writeFile }) => writeFile(path, "existing backup"))
    const storage = new MemoryStorage([
      {
        type: "record",
        entity: "entries",
        key: '["large"]',
        value: { id: "large", content: "x".repeat(16 * 1024 * 1024) },
      },
    ])
    const service = new BackupApplicationService({
      storage,
      settings: { read: () => ({}), write: () => undefined },
    })

    await expect(service.exportToFile(path)).rejects.toThrow("line size")
    await expect(readFile(path, "utf8")).resolves.toBe("existing backup")
  })

  it("keeps committed settings recoverable when their external projection fails", async () => {
    const directory = await makeTemporaryDirectory()
    const path = join(directory, "backup.suhui-backup")
    const source = new MemoryStorage([feedRecord("source")])
    await new BackupApplicationService({
      storage: source,
      settings: { read: () => ({ appearance: "dark" }), write: () => undefined },
    }).exportToFile(path)

    const target = new MemoryStorage([])
    const settings = { value: { appearance: "light" as const }, fail: true }
    const service = new BackupApplicationService({
      storage: target,
      settings: {
        read: () => settings.value,
        write: (value) => {
          if (settings.fail) throw new Error("injected settings failure")
          settings.value = value as typeof settings.value
        },
      },
    })

    await expect(service.restoreFromFile({ path, mode: "merge" })).rejects.toThrow(
      "injected settings failure",
    )
    expect(target.records).toEqual([feedRecord("source")])
    expect(target.pendingSettings).toMatchObject({ appearance: "dark" })

    settings.fail = false
    await expect(service.recoverPendingMainSettings()).resolves.toBe(true)
    expect(settings.value.appearance).toBe("dark")
  })

  it("does not publish a settings journal when the database commit fails", async () => {
    const directory = await makeTemporaryDirectory()
    const path = join(directory, "backup.suhui-backup")
    const source = new MemoryStorage([])
    await new BackupApplicationService({
      storage: source,
      settings: { read: () => ({ appearance: "dark" }), write: () => undefined },
    }).exportToFile(path)
    const target = new MemoryStorage([])
    target.failCommit = true
    const service = new BackupApplicationService({
      storage: target,
      settings: { read: () => ({ appearance: "light" }), write: () => undefined },
    })

    await expect(service.restoreFromFile({ path, mode: "merge" })).rejects.toThrow(
      "injected commit failure",
    )
    expect(target.pendingSettings).toBeNull()
  })
})
