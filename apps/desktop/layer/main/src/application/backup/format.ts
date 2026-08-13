import { createHash } from "node:crypto"

export const BACKUP_FORMAT = "suhui-backup"
export const BACKUP_VERSION = 1
export const BACKUP_MAX_LINE_BYTES = 16 * 1024 * 1024

export const backupEntities = [
  "settings",
  "feeds",
  "subscriptions",
  "inboxes",
  "lists",
  "unread",
  "users",
  "entries",
  "collections",
  "summaries",
  "translations",
  "ai_chat_sessions",
  "ai_chat_messages",
  "applied_sync_ops",
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
] as const

export type BackupEntity = (typeof backupEntities)[number]

export type BackupManifest = {
  type: "manifest"
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  createdAt: number
  appVersion?: string
  excludedSettings?: string[]
}

export type BackupRecord = {
  type: "record"
  entity: BackupEntity
  key: string
  value: Record<string, unknown>
}

export type BackupFooter = {
  type: "footer"
  recordCount: number
  entityCounts: Partial<Record<BackupEntity, number>>
  sha256: string
}

export type BackupValidation = {
  manifest: BackupManifest
  footer: BackupFooter
}

const backupEntitySet = new Set<string>(backupEntities)

const serializeLine = (value: unknown) => {
  const line = `${JSON.stringify(value)}\n`
  if (Buffer.byteLength(line, "utf8") - 1 > BACKUP_MAX_LINE_BYTES) {
    throw new Error("Backup record exceeds the supported line size")
  }
  return line
}

export async function* writeBackupBundle(input: {
  createdAt?: number
  appVersion?: string
  records: AsyncIterable<BackupRecord> | Iterable<BackupRecord>
}): AsyncGenerator<string> {
  const manifest: BackupManifest = {
    type: "manifest",
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: input.createdAt ?? Date.now(),
    ...(input.appVersion ? { appVersion: input.appVersion } : {}),
    excludedSettings: ["follow:ai", "follow:integration"],
  }
  const hash = createHash("sha256")
  const manifestLine = serializeLine(manifest)
  hash.update(manifestLine)
  yield manifestLine

  let recordCount = 0
  const entityCounts: Partial<Record<BackupEntity, number>> = {}
  for await (const record of input.records) {
    assertBackupRecord(record)
    const line = serializeLine(record)
    hash.update(line)
    recordCount += 1
    entityCounts[record.entity] = (entityCounts[record.entity] ?? 0) + 1
    yield line
  }

  const footer: BackupFooter = {
    type: "footer",
    recordCount,
    entityCounts,
    sha256: hash.digest("hex"),
  }
  yield serializeLine(footer)
}

export async function validateBackupBundle(
  lines: AsyncIterable<string> | Iterable<string>,
  options: { maxLineBytes?: number } = {},
): Promise<BackupValidation> {
  const maxLineBytes = options.maxLineBytes ?? BACKUP_MAX_LINE_BYTES
  const hash = createHash("sha256")
  const keys = new Set<string>()
  const entityCounts: Partial<Record<BackupEntity, number>> = {}
  let manifest: BackupManifest | undefined
  let footer: BackupFooter | undefined
  let recordCount = 0
  let lineNumber = 0

  for await (const rawLine of lines) {
    lineNumber += 1
    const line = rawLine.endsWith("\n") ? rawLine.slice(0, -1) : rawLine
    if (Buffer.byteLength(line, "utf8") > maxLineBytes) {
      throw new Error(`Backup line ${lineNumber} exceeds the size limit`)
    }
    if (!line.trim()) throw new Error(`Backup line ${lineNumber} is empty`)

    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      throw new Error(`Backup line ${lineNumber} is not valid JSON`)
    }

    if (!manifest) {
      assertBackupManifest(value)
      manifest = value
      hash.update(`${line}\n`)
      continue
    }

    if (footer) throw new Error("Backup footer must be the final line")
    if (isBackupFooter(value)) {
      footer = value
      continue
    }

    assertBackupRecord(value, lineNumber)
    const uniqueKey = `${value.entity}\0${value.key}`
    if (keys.has(uniqueKey)) {
      throw new Error(`Backup contains duplicate key at line ${lineNumber}`)
    }
    keys.add(uniqueKey)
    recordCount += 1
    entityCounts[value.entity] = (entityCounts[value.entity] ?? 0) + 1
    hash.update(`${line}\n`)
  }

  if (!manifest) throw new Error("Backup manifest is missing")
  if (!footer) throw new Error("Backup footer is missing")
  if (footer.recordCount !== recordCount) throw new Error("Backup record count mismatch")
  if (
    backupEntities.some(
      (entity) => (footer.entityCounts[entity] ?? 0) !== (entityCounts[entity] ?? 0),
    ) ||
    Object.keys(footer.entityCounts).some((entity) => !backupEntitySet.has(entity))
  ) {
    throw new Error("Backup entity counts mismatch")
  }
  if (footer.sha256 !== hash.digest("hex")) throw new Error("Backup checksum mismatch")

  return { manifest, footer }
}

export async function* readBackupRecords(
  lines: AsyncIterable<string> | Iterable<string>,
): AsyncGenerator<BackupRecord> {
  let lineNumber = 0
  for await (const rawLine of lines) {
    lineNumber += 1
    const value = JSON.parse(rawLine.endsWith("\n") ? rawLine.slice(0, -1) : rawLine) as unknown
    if (lineNumber === 1 || isBackupFooter(value)) continue
    assertBackupRecord(value, lineNumber)
    yield value
  }
}

function assertBackupManifest(value: unknown): asserts value is BackupManifest {
  const candidate = value as Partial<BackupManifest> | null
  if (
    !candidate ||
    candidate.type !== "manifest" ||
    candidate.format !== BACKUP_FORMAT ||
    candidate.version !== BACKUP_VERSION ||
    typeof candidate.createdAt !== "number" ||
    (candidate.excludedSettings !== undefined && !Array.isArray(candidate.excludedSettings))
  ) {
    throw new Error("Unsupported or invalid Suhui backup manifest")
  }
}

function assertBackupRecord(value: unknown, lineNumber?: number): asserts value is BackupRecord {
  const candidate = value as Partial<BackupRecord> | null
  if (
    !candidate ||
    candidate.type !== "record" ||
    !backupEntitySet.has(candidate.entity ?? "") ||
    typeof candidate.key !== "string" ||
    !candidate.key ||
    !candidate.value ||
    typeof candidate.value !== "object" ||
    Array.isArray(candidate.value)
  ) {
    throw new Error(`Invalid backup record${lineNumber ? ` at line ${lineNumber}` : ""}`)
  }
}

function isBackupFooter(value: unknown): value is BackupFooter {
  const candidate = value as Partial<BackupFooter> | null
  return !!(
    candidate &&
    candidate.type === "footer" &&
    Number.isInteger(candidate.recordCount) &&
    candidate.entityCounts &&
    typeof candidate.entityCounts === "object" &&
    typeof candidate.sha256 === "string" &&
    /^[a-f\d]{64}$/.test(candidate.sha256)
  )
}
