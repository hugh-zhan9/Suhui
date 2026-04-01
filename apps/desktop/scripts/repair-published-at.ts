#!/usr/bin/env tsx

import fs from "node:fs/promises"

import dotenv from "dotenv"
import { desc, eq } from "drizzle-orm"
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres"
import pg from "pg"

import * as schema from "../../../packages/internal/database/src/schemas"
import { entriesTable } from "../../../packages/internal/database/src/schemas"

import { parseRssFeed } from "../layer/main/src/ipc/services/rss-parser"
import { resolvePublishedAtMs } from "../layer/main/src/ipc/services/rss-time"
import {
  buildLooseIdentityKeys,
  parsePublishedAtRepairArgs,
  shouldRepairPublishedAt,
} from "../layer/main/src/manager/published-at-repair"
import { buildPgConfig } from "../layer/main/src/manager/db-config"
import { ensurePostgresDatabaseExists } from "../layer/main/src/manager/postgres-bootstrap"

const { Pool } = pg

type FeedRow = {
  id: string
  url: string
  title: string | null
}

type EntryRow = {
  id: string
  feedId: string | null
  title: string | null
  url: string | null
  guid: string
  publishedAt: number
  insertedAt: number
}

type RemoteItem = {
  title: string
  url: string
  guid: string
  publishedAt: number
}

type FeedReport = {
  feedId: string
  feedTitle: string | null
  feedUrl: string
  scannedEntries: number
  suspiciousEntries: number
  repairableEntries: number
  appliedEntries: number
  unrecoverableEntries: number
  samples: Array<{
    entryId: string
    title: string | null
    localPublishedAt: number
    insertedAt: number
    remotePublishedAt?: number
    action: "repair" | "report-only"
  }>
  error?: string
}

const usage = `修复/诊断 publishedAt 污染条目

默认只做诊断，不改数据：
  pnpm --filter suhui exec tsx apps/desktop/scripts/repair-published-at.ts

只诊断某个 feed：
  pnpm --filter suhui exec tsx apps/desktop/scripts/repair-published-at.ts --feed-id <feedId>

应用修复：
  pnpm --filter suhui exec tsx apps/desktop/scripts/repair-published-at.ts --mode apply

可选参数：
  --mode report|apply
  --feed-id <feedId>
  --limit-per-feed <number>        默认 500
  --suspicious-window-ms <number>  默认 5000
  --min-correction-ms <number>     默认 3600000
  --request-timeout-ms <number>    默认 15000
  --output <path>                  将 JSON 报告写入文件
`

const loadEnv = () => {
  dotenv.config({ path: ".env", override: true })
}

const fetchFeedXml = async (url: string, timeoutMs: number) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Suhui-PublishedAt-Repair/1.0",
        Accept: "application/rss+xml, application/atom+xml, application/xml, */*",
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

const buildRemoteIndex = (items: RemoteItem[]) => {
  const index = new Map<string, RemoteItem>()
  for (const item of items) {
    for (const key of buildLooseIdentityKeys(item)) {
      if (!index.has(key)) {
        index.set(key, item)
      }
    }
  }
  return index
}

const findRemoteMatch = (index: Map<string, RemoteItem>, entry: EntryRow) => {
  for (const key of buildLooseIdentityKeys(entry)) {
    const match = index.get(key)
    if (match) return match
  }
  return null
}

const main = async () => {
  const args = parsePublishedAtRepairArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage)
    return
  }

  loadEnv()

  await ensurePostgresDatabaseExists(process.env)
  const pgPool = new Pool(buildPgConfig(process.env))
  const db = drizzlePg(pgPool, { schema })

  try {
    const subscriptions = await db.query.subscriptionsTable.findMany({
      where: (table, { and, eq, isNotNull }) =>
        and(
          eq(table.type, "feed"),
          isNotNull(table.feedId),
          args.feedId ? eq(table.feedId, args.feedId) : undefined,
        ),
      columns: { feedId: true },
    })

    const feedIds = Array.from(
      new Set(subscriptions.map((item) => item.feedId).filter((id): id is string => !!id)),
    )

    const feeds = await db.query.feedsTable.findMany({
      where: (table, { inArray }) => (feedIds.length > 0 ? inArray(table.id, feedIds) : undefined),
      columns: { id: true, url: true, title: true },
    })

    const report: {
      mode: string
      scannedFeeds: number
      suspiciousEntries: number
      repairableEntries: number
      appliedEntries: number
      feeds: FeedReport[]
    } = {
      mode: args.mode,
      scannedFeeds: feeds.length,
      suspiciousEntries: 0,
      repairableEntries: 0,
      appliedEntries: 0,
      feeds: [],
    }

    for (const feed of feeds as FeedRow[]) {
      const feedReport: FeedReport = {
        feedId: feed.id,
        feedTitle: feed.title,
        feedUrl: feed.url,
        scannedEntries: 0,
        suspiciousEntries: 0,
        repairableEntries: 0,
        appliedEntries: 0,
        unrecoverableEntries: 0,
        samples: [],
      }

      try {
        const entries = (await db.query.entriesTable.findMany({
          where: eq(entriesTable.feedId, feed.id),
          orderBy: [desc(entriesTable.insertedAt)],
          limit: args.limitPerFeed,
          columns: {
            id: true,
            feedId: true,
            title: true,
            url: true,
            guid: true,
            publishedAt: true,
            insertedAt: true,
          },
        })) as EntryRow[]

        feedReport.scannedEntries = entries.length
        const xml = await fetchFeedXml(feed.url, args.requestTimeoutMs)
        const parsed = parseRssFeed(xml)
        const remoteIndex = buildRemoteIndex(
          parsed.items.map((item) => ({
            ...item,
            publishedAt: resolvePublishedAtMs(item.publishedAt),
          })),
        )

        const updates: Array<{ id: string; publishedAt: number }> = []

        for (const entry of entries) {
          const remoteMatch = findRemoteMatch(remoteIndex, entry)
          const suspicious =
            Math.abs(entry.insertedAt - entry.publishedAt) <= args.suspiciousWindowMs
          if (!suspicious) continue

          feedReport.suspiciousEntries += 1
          report.suspiciousEntries += 1

          const repairable =
            !!remoteMatch &&
            shouldRepairPublishedAt({
              localPublishedAt: entry.publishedAt,
              localInsertedAt: entry.insertedAt,
              remotePublishedAt: remoteMatch.publishedAt,
              suspiciousWindowMs: args.suspiciousWindowMs,
              minCorrectionMs: args.minCorrectionMs,
            })

          if (repairable && remoteMatch) {
            feedReport.repairableEntries += 1
            report.repairableEntries += 1
            updates.push({ id: entry.id, publishedAt: remoteMatch.publishedAt })
          } else {
            feedReport.unrecoverableEntries += 1
          }

          if (feedReport.samples.length < 10) {
            feedReport.samples.push({
              entryId: entry.id,
              title: entry.title,
              localPublishedAt: entry.publishedAt,
              insertedAt: entry.insertedAt,
              remotePublishedAt: remoteMatch?.publishedAt,
              action: repairable ? "repair" : "report-only",
            })
          }
        }

        if (args.mode === "apply") {
          for (const update of updates) {
            await db
              .update(entriesTable)
              .set({ publishedAt: update.publishedAt })
              .where(eq(entriesTable.id, update.id))
            feedReport.appliedEntries += 1
            report.appliedEntries += 1
          }
        }
      } catch (error) {
        feedReport.error = error instanceof Error ? error.message : String(error)
      }

      report.feeds.push(feedReport)
    }

    if (args.output) {
      await fs.writeFile(args.output, JSON.stringify(report, null, 2), "utf8")
      console.log(`[published-at-repair] report written to ${args.output}`)
    }

    console.log(JSON.stringify(report, null, 2))
  } finally {
    await pgPool.end()
  }
}

void main().catch((error) => {
  console.error("[published-at-repair] failed", error)
  process.exitCode = 1
})
