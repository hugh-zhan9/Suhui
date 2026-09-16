import { createHash } from "node:crypto"

import { describe, expect, it } from "vitest"

import type { BackupRecord } from "./format"
import { validateBackupBundle, writeBackupBundle } from "./format"

const collect = async (chunks: AsyncIterable<string>) => {
  const result: string[] = []
  for await (const chunk of chunks) result.push(chunk)
  return result
}

const records: BackupRecord[] = [
  { type: "record", entity: "settings", key: "main", value: { appearance: "dark" } },
  { type: "record", entity: "feeds", key: '["feed-1"]', value: { id: "feed-1" } },
]

describe("Suhui backup bundle format", () => {
  it("writes and validates a versioned streaming bundle", async () => {
    const lines = await collect(writeBackupBundle({ createdAt: 123, appVersion: "1.2.3", records }))

    const result = await validateBackupBundle(lines)

    expect(result.manifest).toMatchObject({
      format: "suhui-backup",
      version: 2,
      createdAt: 123,
    })
    expect(result.footer.recordCount).toBe(2)
    expect(result.footer.entityCounts).toEqual({ settings: 1, feeds: 1 })
  })

  it("rejects tampering before records are exposed for restore", async () => {
    const lines = await collect(writeBackupBundle({ createdAt: 123, records }))
    lines[1] = lines[1]!.replace("dark", "light")

    await expect(validateBackupBundle(lines)).rejects.toThrow("checksum")
  })

  it("rejects duplicate entity keys", async () => {
    const lines = await collect(
      writeBackupBundle({ createdAt: 123, records: [records[0]!, records[0]!] }),
    )

    await expect(validateBackupBundle(lines)).rejects.toThrow("duplicate key")
  })
  it("reads legacy v1 bundles and rejects unsupported future formats", async () => {
    const lines = await collect(writeBackupBundle({ records }))
    lines[0] = lines[0]!.replace('"version":2', '"version":1')
    const footer = JSON.parse(lines.at(-1)!)
    footer.sha256 = createHash("sha256").update(lines.slice(0, -1).join("")).digest("hex")
    lines[lines.length - 1] = `${JSON.stringify(footer)}\n`
    expect((await validateBackupBundle(lines)).manifest.version).toBe(1)
    lines[0] = lines[0]!.replace('"version":1', '"version":999')
    await expect(validateBackupBundle(lines)).rejects.toThrow()
  })
})
