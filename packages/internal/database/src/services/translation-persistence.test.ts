import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { DatabaseSync } from "node:sqlite"

import { drizzle } from "drizzle-orm/sqlite-proxy"
import { join } from "pathe"
import { afterEach, expect, it, vi } from "vitest"

import { sqliteMigrations } from "../drizzle/sqlite-baseline"
import { setRuntimeDbType } from "../schemas/runtime"
import * as schema from "../schemas/sqlite"
import { TranslationService } from "./translation"

const handle = vi.hoisted(() => ({ db: undefined as any }))
vi.mock("../db", () => ({
  get db() {
    return handle.db
  },
}))

let raw: DatabaseSync | undefined
let directory: string | undefined
afterEach(() => {
  raw?.close()
  raw = undefined
  if (directory) rmSync(directory, { recursive: true, force: true })
  setRuntimeDbType("postgres")
})

it("persists separate concurrent batches through reopen, upserts without lost rows, and deletes with the article", async () => {
  directory = mkdtempSync(join(tmpdir(), "suhui-translations-"))
  const file = join(directory, "test.db")
  const open = () => {
    raw = new DatabaseSync(file)
    raw.exec("PRAGMA foreign_keys=ON")
    handle.db = drizzle(
      async (sql, params, method) => {
        const statement = raw!.prepare(sql)
        if (method === "run") {
          statement.run(...(params as never[]))
          return { rows: [] }
        }
        const rows = statement.all(...(params as never[])).map((row) => Object.values(row))
        return { rows: method === "get" ? (rows[0] ?? []) : rows }
      },
      { schema },
    )
    setRuntimeDbType("sqlite")
  }
  open()
  for (const migration of sqliteMigrations) for (const sql of migration.statements) raw!.exec(sql)
  raw!.exec(
    "INSERT INTO entries (id, guid, inserted_at, published_at) VALUES ('entry','entry',0,0)",
  )
  const base = {
    entryId: "entry",
    language: "zh-CN" as const,
    sourceHash: "source",
    configHash: "old-model",
    planVersion: 1,
    target: "content" as const,
    updatedAt: "2020-01-01T00:00:00.000Z",
  }
  await Promise.all(
    Array.from({ length: 7 }, (_, index) =>
      TranslationService.saveBatch({
        ...base,
        batchId: `content:${index + 1}`,
        values: [`译文 ${index} " \\ 😀`],
      }),
    ),
  )
  raw!.close()
  open()
  const rows = await TranslationService.getBatches("entry", "zh-CN", "source", 1)
  expect(rows).toHaveLength(7)
  expect(rows[0]!.values).toEqual(['译文 0 " \\ 😀'])
  expect(await TranslationService.getBatches("entry", "zh-CN", "changed", 1)).toEqual([])
  expect(await TranslationService.getBatches("entry", "zh-CN", "source", 2)).toEqual([])
  await TranslationService.saveBatch({
    ...base,
    batchId: "content:1",
    values: ["重新翻译"],
    configHash: "new-model",
  })
  expect(await TranslationService.getBatches("entry", "zh-CN", "source", 1)).toHaveLength(7)
  await TranslationService.replaceTranslation({
    ...base,
    title: "标题",
    description: "摘要",
    content: null,
    readabilityContent: null,
  })
  await Promise.all([
    TranslationService.replaceTranslation(
      { ...base, title: "标题", description: null, content: "新正文", readabilityContent: null },
      "content",
    ),
    TranslationService.replaceTranslation(
      { ...base, title: "标题", description: null, content: null, readabilityContent: "提取正文" },
      "readabilityContent",
    ),
  ])
  const full = await TranslationService.getTranslation("entry", "zh-CN")
  expect(full).toMatchObject({
    description: "摘要",
    content: "新正文",
    readabilityContent: "提取正文",
  })
  await TranslationService.replaceTranslation(
    {
      ...base,
      sourceHash: "changed",
      title: "新标题",
      description: null,
      content: "改变原文",
      readabilityContent: null,
    },
    "content",
  )
  expect(await TranslationService.getTranslation("entry", "zh-CN")).toMatchObject({
    description: null,
    readabilityContent: null,
    content: "改变原文",
  })
  raw!.exec("DELETE FROM entries WHERE id='entry'")
  expect(await TranslationService.getBatches("entry", "zh-CN", "source", 1)).toEqual([])
})
