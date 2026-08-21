import { randomUUID } from "node:crypto"
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"

import { store } from "~/lib/store"

import { openUtf8LineSource, readUtf8Lines, writeFileAtomically } from "./file"
import type { BackupRecord, BackupValidation } from "./format"
import { readBackupRecords, validateBackupBundle, writeBackupBundle } from "./format"
import type { BackupStorage, RestoreMode } from "./storage"
import { createBackupStorage } from "./storage-factory"

type ReplaceConfirmation = {
  path: string
  sha256: string
  expiresAt: number
}

type BackupSettings = {
  appearance?: "light" | "dark" | "system" | null
  cacheSizeLimit?: number | null
  minimizeToTray?: boolean | null
  rsshubCustomUrl?: string | null
  rendererSettings?: Record<string, string>
}

type BackupServiceOptions = {
  storage?: BackupStorage
  now?: () => number
  settings?: {
    read: () => BackupSettings
    write: (value: BackupSettings) => void
  }
  safetySnapshotDirectory?: string
}

const defaultSettings = {
  read: (): BackupSettings => {
    const values = store.store
    return {
      appearance: values.appearance,
      cacheSizeLimit: values.cacheSizeLimit,
      minimizeToTray: values.minimizeToTray,
      rsshubCustomUrl: values.rsshubCustomUrl,
      rendererSettings: store.get("rendererSettings" as never) as
        | Record<string, string>
        | undefined,
    }
  },
  write: (value: BackupSettings) => {
    for (const key of [
      "appearance",
      "cacheSizeLimit",
      "minimizeToTray",
      "rsshubCustomUrl",
      "rendererSettings",
    ] as const) {
      if (value[key] === undefined) store.delete(key as never)
      else store.set(key as never, value[key] as never)
    }
  },
}

export class BackupApplicationService {
  private operation: Promise<void> = Promise.resolve()
  private readonly injectedStorage?: BackupStorage
  private readonly now: () => number
  private readonly settings: NonNullable<BackupServiceOptions["settings"]>
  private readonly safetySnapshotDirectory?: string
  private readonly confirmations = new Map<string, ReplaceConfirmation>()

  /**
   * 惰性解析：模块级单例在数据库初始化之前就构造出来了，
   * 此时问方言会抛 "Database not initialized"。
   */
  private get storage(): BackupStorage {
    return this.injectedStorage ?? createBackupStorage()
  }

  constructor(options: BackupServiceOptions = {}) {
    this.injectedStorage = options.storage
    this.now = options.now ?? Date.now
    this.settings = options.settings ?? defaultSettings
    this.safetySnapshotDirectory = options.safetySnapshotDirectory
  }

  async exportToFile(path: string, appVersion?: string, rendererSettings?: Record<string, string>) {
    return this.serialized(() => this.exportToFileUnlocked(path, appVersion, rendererSettings))
  }

  private async exportToFileUnlocked(
    path: string,
    appVersion?: string,
    rendererSettings?: Record<string, string>,
  ) {
    const settingsRecord: BackupRecord = {
      type: "record",
      entity: "settings",
      key: "main",
      value: { ...this.settings.read(), ...(rendererSettings ? { rendererSettings } : {}) },
    }
    const records = this.prepend(settingsRecord, this.storage.streamRecords())
    await writeFileAtomically(
      path,
      writeBackupBundle({ createdAt: this.now(), appVersion, records }),
    )
    return this.validateFile(path)
  }

  validateFile(path: string) {
    return validateBackupBundle(readUtf8Lines(path))
  }

  async recoverPendingMainSettings() {
    const pending = await this.storage.readPendingSettings("main")
    if (!pending) return false
    this.settings.write(pending as BackupSettings)
    await this.storage.markSettingsApplied("main")
    return true
  }

  async getPendingRendererSettings() {
    const pending = await this.storage.readPendingSettings("renderer")
    if (!pending) return null
    return (pending as BackupSettings).rendererSettings ?? {}
  }

  markRendererSettingsApplied() {
    return this.storage.markSettingsApplied("renderer")
  }

  async prepareReplace(path: string) {
    const validation = await this.validateFile(path)
    const token = randomUUID()
    const expiresAt = this.now() + 5 * 60_000
    this.confirmations.set(token, {
      path: resolve(path),
      sha256: validation.footer.sha256,
      expiresAt,
    })
    return { token, expiresAt, validation }
  }

  async restoreFromFile(input: {
    path: string
    mode: RestoreMode
    confirmationToken?: string
    rendererSettings?: Record<string, string>
  }) {
    return this.serialized(() => this.restoreFromFileUnlocked(input))
  }

  private async restoreFromFileUnlocked(input: {
    path: string
    mode: RestoreMode
    confirmationToken?: string
    rendererSettings?: Record<string, string>
  }) {
    const stagingDirectory = await mkdtemp(join(tmpdir(), "suhui-restore-"))
    const stagingPath = join(stagingDirectory, "input.suhui-backup")
    try {
      await copyFile(input.path, stagingPath)
      const source = await openUtf8LineSource(stagingPath)
      let validation: BackupValidation
      try {
        validation = await validateBackupBundle(source.lines())
        let snapshotPath: string | undefined
        if (input.mode === "replace") {
          this.consumeConfirmation(input.path, input.confirmationToken, validation)
          const snapshotDirectory =
            this.safetySnapshotDirectory ?? join(dirname(input.path), "snapshots")
          await mkdir(snapshotDirectory, { recursive: true, mode: 0o700 })
          snapshotPath = join(
            snapshotDirectory,
            `${basename(input.path)}.${this.now()}.pre-restore.suhui-backup`,
          )
          await this.exportToFileUnlocked(snapshotPath, undefined, input.rendererSettings)
        }

        const transaction = await this.storage.beginRestore(input.mode)
        let pendingSettings: BackupSettings | undefined
        const previousSettings = {
          ...this.settings.read(),
          ...(input.rendererSettings ? { rendererSettings: input.rendererSettings } : {}),
        }
        let nextSettings: BackupSettings | undefined
        let restoredRecords = 0
        try {
          if (input.mode === "replace") await transaction.clear()
          let batch: BackupRecord[] = []
          for await (const record of readBackupRecords(source.lines())) {
            if (record.entity === "settings") {
              pendingSettings = record.value as BackupSettings
              continue
            }
            if (batch.length > 0 && batch[0]!.entity !== record.entity) {
              await transaction.upsert(batch)
              restoredRecords += batch.length
              batch = []
            }
            batch.push(record)
            if (batch.length >= 200) {
              await transaction.upsert(batch)
              restoredRecords += batch.length
              batch = []
            }
          }
          await transaction.upsert(batch)
          restoredRecords += batch.length
          if (pendingSettings) {
            const mergedRendererSettings =
              input.mode === "merge"
                ? previousSettings.rendererSettings || pendingSettings.rendererSettings
                  ? {
                      ...previousSettings.rendererSettings,
                      ...pendingSettings.rendererSettings,
                    }
                  : undefined
                : pendingSettings.rendererSettings
            const rendererSettingsPatch = mergedRendererSettings
              ? { rendererSettings: mergedRendererSettings }
              : {}
            nextSettings =
              input.mode === "merge"
                ? { ...previousSettings, ...pendingSettings, ...rendererSettingsPatch }
                : pendingSettings
            await transaction.stageSettings(nextSettings as Record<string, unknown>)
          }
          await transaction.commit()
        } catch (error) {
          await transaction.rollback()
          throw error
        }

        // The durable journal is committed with the restored database. If the
        // process exits here, startup retries the external settings projection.
        if (nextSettings) await this.recoverPendingMainSettings()

        return {
          mode: input.mode,
          restoredRecords,
          snapshotPath,
          validation,
          rendererSettings:
            nextSettings?.rendererSettings ?? previousSettings.rendererSettings ?? {},
        }
      } finally {
        await source.close()
      }
    } finally {
      await rm(stagingDirectory, { recursive: true, force: true })
    }
  }

  private async serialized<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.operation
    let release!: () => void
    this.operation = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await task()
    } finally {
      release()
    }
  }

  private consumeConfirmation(
    path: string,
    token: string | undefined,
    validation: BackupValidation,
  ) {
    if (!token) throw new Error("Replace restore requires confirmation")
    const confirmation = this.confirmations.get(token)
    this.confirmations.delete(token)
    if (
      !confirmation ||
      confirmation.expiresAt < this.now() ||
      confirmation.path !== resolve(path) ||
      confirmation.sha256 !== validation.footer.sha256
    ) {
      throw new Error("Replace confirmation is invalid or expired")
    }
  }

  private async *prepend(
    first: BackupRecord,
    rest: AsyncIterable<BackupRecord>,
  ): AsyncGenerator<BackupRecord> {
    yield first
    yield* rest
  }
}

export const backupApplicationService = new BackupApplicationService()
