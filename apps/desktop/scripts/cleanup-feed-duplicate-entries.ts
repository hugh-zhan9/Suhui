#!/usr/bin/env tsx

import fs from "node:fs/promises"
import os from "node:os"

import dotenv from "dotenv"
import { desc, eq, inArray } from "drizzle-orm"
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres"
import { join } from "pathe"
import pg from "pg"

import * as schema from "../../../packages/internal/database/src/schemas"
import { entriesTable } from "../../../packages/internal/database/src/schemas"

import { buildEntryTitlePublishedKey } from "../layer/main/src/ipc/services/rss-refresh"
import { buildPgConfig } from "../layer/main/src/manager/db-config"
import { ensurePostgresDatabaseExists } from "../layer/main/src/manager/postgres-bootstrap"

const { Pool } = pg
const DEFAULT_APP_NAME = "溯洄"
const DEFAULT_MODE = "report"

type ScriptMode = "report" | "apply"

type CleanupArgs = {
  help: boolean
  mode: ScriptMode
  allFeeds: boolean
  feedId?: string
  feedUrl?: string
  output?: string
}

type FeedRow = {
  id: string
  title: string | null
  url: string
}

type EntryRow = {
  id: string
  title: string | null
  url: string | null
  guid: string
  publishedAt: number
  insertedAt: number
  read: boolean | null
}

type DuplicateGroup = {
  title: string
  publishedAt: number
  keep: EntryRow
  remove: EntryRow[]
}

type FeedCleanupReport = {
  feed: FeedRow
  scannedEntryCount: number
  duplicateGroupCount: number
  removedEntryCount: number
  duplicateGroups: Array<{
    title: string
    publishedAt: number
    keep: EntryRow
    remove: EntryRow[]
    readMergedToKeep: boolean
  }>
}

const usage = `清理同 feed 下“同标题 + 同发布时间”的历史重复文章，保留最新一条

示例：
  pnpm --filter suhui exec tsx apps/desktop/scripts/cleanup-feed-duplicate-entries.ts --all-feeds
  pnpm --filter suhui exec tsx apps/desktop/scripts/cleanup-feed-duplicate-entries.ts --feed-url https://simonaking.com/blog/atom.xml
  pnpm --filter suhui exec tsx apps/desktop/scripts/cleanup-feed-duplicate-entries.ts --feed-id local_feed_xxx --mode apply

参数：
  --all-feeds            扫描当前已订阅的全部 feed
  --feed-id <feedId>      指定 feed id
  --feed-url <feedUrl>    指定 feed url
  --mode report|apply     默认 report
  --output <path>         将 JSON 报告写入文件
  --help, -h              显示帮助

说明：
  - 仅按同一 feed 内“标题 + 发布时间”完全一致来判重
  - 保留 insertedAt 更新的一条
  - apply 模式会迁移 collections / summaries / translations 的 entry 引用
  - 如旧记录为已读，保留记录也会提升为已读
  - 全量 apply 请显式加 --all-feeds，避免误操作
`

const parseArgs = (argv: string[]): CleanupArgs => {
  const args: CleanupArgs = { help: false, mode: DEFAULT_MODE, allFeeds: false }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg) continue

    if (arg === "--help" || arg === "-h") {
      args.help = true
      continue
    }

    if (arg === "--all-feeds") {
      args.allFeeds = true
      continue
    }

    if (arg === "--feed-id") {
      const value = argv[i + 1]
      if (!value) throw new Error("Missing value for --feed-id")
      args.feedId = value
      i += 1
      continue
    }

    if (arg === "--feed-url") {
      const value = argv[i + 1]
      if (!value) throw new Error("Missing value for --feed-url")
      args.feedUrl = value
      i += 1
      continue
    }

    if (arg === "--mode") {
      const value = argv[i + 1]
      if (value !== "report" && value !== "apply") {
        throw new Error("Mode must be report or apply")
      }
      args.mode = value
      i += 1
      continue
    }

    if (arg === "--output") {
      const value = argv[i + 1]
      if (!value) throw new Error("Missing value for --output")
      args.output = value
      i += 1
      continue
    }
  }

  const selectionCount = [args.allFeeds, !!args.feedId, !!args.feedUrl].filter(Boolean).length
  if (!args.help && selectionCount === 0) {
    throw new Error("Use --all-feeds, --feed-id, or --feed-url")
  }
  if (selectionCount > 1) {
    throw new Error("Use only one selector: --all-feeds, --feed-id, or --feed-url")
  }
  if (args.mode === "apply" && args.allFeeds !== true && !args.feedId && !args.feedUrl) {
    throw new Error("Apply mode requires --all-feeds, --feed-id, or --feed-url")
  }

  return args
}

const resolveUserDataBaseDir = (appName: string) => {
  const homeDir = os.homedir()
  if (process.platform === "darwin") {
    return join(homeDir, "Library", "Application Support", appName)
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? join(homeDir, "AppData", "Roaming")
    return join(appData, appName)
  }
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homeDir, ".config")
  return join(configHome, appName)
}

const loadEnv = () => {
  dotenv.config({ path: ".env", override: true })

  const envCandidates = [
    process.env.SUHUI_USER_DATA_PATH ? join(process.env.SUHUI_USER_DATA_PATH, ".env") : null,
    join(resolveUserDataBaseDir(`${DEFAULT_APP_NAME}(dev)`), ".env"),
    join(resolveUserDataBaseDir(DEFAULT_APP_NAME), ".env"),
  ].filter((path): path is string => !!path)

  for (const path of envCandidates) {
    dotenv.config({ path, override: true })
  }
}

const compareEntriesForKeep = (left: EntryRow, right: EntryRow) => {
  if (left.insertedAt !== right.insertedAt) {
    return right.insertedAt - left.insertedAt
  }
  return right.id.localeCompare(left.id)
}

const buildDuplicateGroups = (entries: EntryRow[]) => {
  const grouped = new Map<string, EntryRow[]>()

  for (const entry of entries) {
    const key = buildEntryTitlePublishedKey(entry)
    if (!key) continue
    const current = grouped.get(key)
    if (current) {
      current.push(entry)
    } else {
      grouped.set(key, [entry])
    }
  }

  const groups: DuplicateGroup[] = []
  for (const groupEntries of grouped.values()) {
    if (groupEntries.length <= 1) continue

    const sorted = [...groupEntries].sort(compareEntriesForKeep)
    const keep = sorted[0]
    if (!keep?.title) continue

    groups.push({
      title: keep.title,
      publishedAt: keep.publishedAt,
      keep,
      remove: sorted.slice(1),
    })
  }

  groups.sort((left, right) => compareEntriesForKeep(left.keep, right.keep))
  return groups
}

const moveCollections = async (client: pg.PoolClient, keepId: string, removeId: string) => {
  await client.query(
    `
      INSERT INTO collections (feed_id, entry_id, created_at, view)
      SELECT feed_id, $1, created_at, view
      FROM collections
      WHERE entry_id = $2
      ON CONFLICT (entry_id) DO NOTHING
    `,
    [keepId, removeId],
  )
  await client.query(`DELETE FROM collections WHERE entry_id = $1`, [removeId])
}

const moveSummaries = async (client: pg.PoolClient, keepId: string, removeId: string) => {
  await client.query(
    `
      INSERT INTO summaries (entry_id, summary, readability_summary, created_at, language)
      SELECT $1, summary, readability_summary, created_at, language
      FROM summaries
      WHERE entry_id = $2
      ON CONFLICT (entry_id, language) DO NOTHING
    `,
    [keepId, removeId],
  )
  await client.query(`DELETE FROM summaries WHERE entry_id = $1`, [removeId])
}

const moveTranslations = async (client: pg.PoolClient, keepId: string, removeId: string) => {
  await client.query(
    `
      INSERT INTO translations (
        entry_id,
        language,
        title,
        description,
        content,
        readability_content,
        created_at
      )
      SELECT
        $1,
        language,
        title,
        description,
        content,
        readability_content,
        created_at
      FROM translations
      WHERE entry_id = $2
      ON CONFLICT (entry_id, language) DO NOTHING
    `,
    [keepId, removeId],
  )
  await client.query(`DELETE FROM translations WHERE entry_id = $1`, [removeId])
}

const migrateEntryReferences = async (client: pg.PoolClient, keepId: string, removeId: string) => {
  await moveCollections(client, keepId, removeId)
  await moveSummaries(client, keepId, removeId)
  await moveTranslations(client, keepId, removeId)
}

const resolveTargetFeed = async (
  db: ReturnType<typeof drizzlePg<typeof schema>>,
  args: CleanupArgs,
): Promise<FeedRow> => {
  if (args.feedId) {
    const feed = await db.query.feedsTable.findFirst({
      where: (table, { eq }) => eq(table.id, args.feedId!),
      columns: { id: true, title: true, url: true },
    })
    if (!feed) {
      throw new Error(`Feed not found by id: ${args.feedId}`)
    }
    return feed as FeedRow
  }

  const feed = await db.query.feedsTable.findFirst({
    where: (table, { eq }) => eq(table.url, args.feedUrl!),
    columns: { id: true, title: true, url: true },
  })
  if (!feed) {
    throw new Error(`Feed not found by url: ${args.feedUrl}`)
  }
  return feed as FeedRow
}

const resolveTargetFeeds = async (
  db: ReturnType<typeof drizzlePg<typeof schema>>,
  args: CleanupArgs,
): Promise<FeedRow[]> => {
  if (!args.allFeeds) {
    return [await resolveTargetFeed(db, args)]
  }

  const subscriptions = await db.query.subscriptionsTable.findMany({
    where: (table, { and, eq, isNotNull }) => and(eq(table.type, "feed"), isNotNull(table.feedId)),
    columns: { feedId: true },
  })
  const feedIds = Array.from(
    new Set(subscriptions.map((item) => item.feedId).filter((id): id is string => !!id)),
  )
  if (feedIds.length === 0) return []

  const feeds = await db.query.feedsTable.findMany({
    where: inArray(schema.feedsTable.id, feedIds),
    columns: { id: true, title: true, url: true },
  })
  return (feeds as FeedRow[]).sort((left, right) => left.id.localeCompare(right.id))
}

const buildFeedReport = (feed: FeedRow, entries: EntryRow[]): FeedCleanupReport => {
  const duplicateGroups = buildDuplicateGroups(entries)
  const removedEntryCount = duplicateGroups.reduce((count, group) => count + group.remove.length, 0)

  return {
    feed,
    scannedEntryCount: entries.length,
    duplicateGroupCount: duplicateGroups.length,
    removedEntryCount,
    duplicateGroups: duplicateGroups.map((group) => ({
      title: group.title,
      publishedAt: group.publishedAt,
      keep: group.keep,
      remove: group.remove,
      readMergedToKeep: !!group.keep.read || group.remove.some((entry) => !!entry.read),
    })),
  }
}

const applyFeedCleanup = async (pgPool: pg.Pool, feedReport: FeedCleanupReport) => {
  if (feedReport.duplicateGroupCount === 0) return

  const client = await pgPool.connect()
  try {
    await client.query("BEGIN")
    for (const group of feedReport.duplicateGroups) {
      if (group.readMergedToKeep && !group.keep.read) {
        await client.query(`UPDATE entries SET read = TRUE WHERE id = $1`, [group.keep.id])
      }

      for (const removable of group.remove) {
        await migrateEntryReferences(client, group.keep.id, removable.id)
      }

      await client.query(`DELETE FROM entries WHERE id = ANY($1::text[])`, [
        group.remove.map((entry) => entry.id),
      ])
    }
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage)
    return
  }

  loadEnv()

  await ensurePostgresDatabaseExists(process.env)
  const pgPool = new Pool(buildPgConfig(process.env))
  const db = drizzlePg(pgPool, { schema })

  try {
    const feeds = await resolveTargetFeeds(db, args)
    const feedReports: FeedCleanupReport[] = []

    for (const feed of feeds) {
      const entries = (await db.query.entriesTable.findMany({
        where: eq(entriesTable.feedId, feed.id),
        columns: {
          id: true,
          title: true,
          url: true,
          guid: true,
          publishedAt: true,
          insertedAt: true,
          read: true,
        },
        orderBy: [desc(entriesTable.insertedAt), desc(entriesTable.id)],
      })) as EntryRow[]

      const feedReport = buildFeedReport(feed, entries)
      feedReports.push(feedReport)

      if (args.mode === "apply") {
        await applyFeedCleanup(pgPool, feedReport)
      }
    }

    const affectedFeedReports = feedReports
      .filter((report) => report.duplicateGroupCount > 0)
      .sort((left, right) => {
        if (right.removedEntryCount !== left.removedEntryCount) {
          return right.removedEntryCount - left.removedEntryCount
        }
        return left.feed.id.localeCompare(right.feed.id)
      })

    const report = {
      mode: args.mode,
      scope: args.allFeeds ? "all-feeds" : "single-feed",
      scannedFeedCount: feedReports.length,
      affectedFeedCount: affectedFeedReports.length,
      scannedEntryCount: feedReports.reduce((count, item) => count + item.scannedEntryCount, 0),
      duplicateGroupCount: feedReports.reduce((count, item) => count + item.duplicateGroupCount, 0),
      removedEntryCount: feedReports.reduce((count, item) => count + item.removedEntryCount, 0),
      feeds: affectedFeedReports,
    }

    if (args.mode === "apply" && duplicateGroups.length > 0) {
      const client = await pgPool.connect()
      try {
        await client.query("BEGIN")
        for (const group of duplicateGroups) {
          const keepRead = !!group.keep.read || group.remove.some((entry) => !!entry.read)
          if (keepRead && !group.keep.read) {
            await client.query(`UPDATE entries SET read = TRUE WHERE id = $1`, [group.keep.id])
          }

          for (const removable of group.remove) {
            await migrateEntryReferences(client, group.keep.id, removable.id)
          }

          await client.query(`DELETE FROM entries WHERE id = ANY($1::text[])`, [
            group.remove.map((entry) => entry.id),
          ])
        }
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    }

    if (args.output) {
      await fs.writeFile(args.output, JSON.stringify(report, null, 2))
    }

    console.log(JSON.stringify(report, null, 2))
  } finally {
    await pgPool.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
