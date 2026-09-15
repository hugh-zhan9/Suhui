import { runInMainTransaction } from "@suhui/database/db.main"
import type { EntrySchema } from "@suhui/database/schemas/types"
import { entriesTable, feedsTable } from "@suhui/database/schemas/index"
import { sanitizeEntryJsonFields } from "@suhui/database/services/entry"
import { and, eq, isNull } from "drizzle-orm"

import {
  buildExistingEntryReuseIndex,
  buildRefreshedFeed,
  normalizeEntryUrl,
  resolveExistingEntryIdForRefresh,
} from "~/ipc/services/rss-refresh"
import { DBManager } from "~/manager/db"
import { FeedRefreshService } from "~/manager/feed-refresh"

import { localReadingPipeline } from "../local-reading/pipeline"
import { runFeedOperation } from "./operation"

type RepairFeed = { id: string; url: string; siteUrl: string | null }
type Preview = Awaited<ReturnType<typeof FeedRefreshService.buildPreviewData>>

export const getRepairPages = (feed: RepairFeed) => {
  const source = new URL(feed.url)
  if (!/^https?:$/.test(source.protocol) || source.hostname === "rsshub.app")
    throw new Error("此类订阅请通过编辑地址或 RSSHub 设置修复")
  let site = source.origin + "/"
  try {
    const candidate = new URL(feed.siteUrl || site)
    if (/^https?:$/.test(candidate.protocol) && !candidate.username && !candidate.password) {
      candidate.hash = ""
      site = candidate.href
    }
  } catch {
    /* Missing/invalid site URL: use the original feed's origin. */
  }
  // Keep blog subdomains and site subdirectories; stripping to a registrable
  // domain can accidentally subscribe to an entirely different website.
  return [...new Set([site, new URL(site).origin + "/"])]
}

const readFeed = async (feedId: string): Promise<RepairFeed> => {
  const db = DBManager.getDB()
  const [feed, subscription] = await Promise.all([
    db.query.feedsTable.findFirst({ where: (t) => and(eq(t.id, feedId), isNull(t.deletedAt)) }),
    db.query.subscriptionsTable.findFirst({
      where: (t) => and(eq(t.feedId, feedId), isNull(t.deletedAt)),
    }),
  ])
  if (!feed || !subscription) throw new Error("该订阅已取消或不存在")
  return feed
}

export const selectMissingRepairEntries = (
  existing: { id: string; guid?: string | null; url?: string | null; read?: boolean | null }[],
  incoming: Preview["entries"],
) => {
  const index = buildExistingEntryReuseIndex(existing)
  const ids = new Set(existing.map((entry) => entry.id))
  const urls = new Set(existing.map((entry) => normalizeEntryUrl(entry.url)).filter(Boolean))
  return incoming.filter((entry) => {
    const url = normalizeEntryUrl(entry.url)
    if (
      ids.has(entry.id) ||
      resolveExistingEntryIdForRefresh(index, entry) ||
      (url && urls.has(url))
    )
      return false
    ids.add(entry.id)
    if (url) urls.add(url)
    return true
  })
}

const saveRepair = async (original: RepairFeed, preview: Preview) => {
  const addedIds = await runInMainTransaction(async (tx) => {
    const current = await tx.query.feedsTable.findFirst({
      where: (t) => and(eq(t.id, original.id), isNull(t.deletedAt)),
    })
    const subscription = await tx.query.subscriptionsTable.findFirst({
      where: (t) => and(eq(t.feedId, original.id), isNull(t.deletedAt)),
    })
    if (
      !current ||
      !subscription ||
      current.url !== original.url ||
      current.siteUrl !== original.siteUrl
    )
      throw new Error("订阅已改变，请重新尝试")
    const existing = await tx.query.entriesTable.findMany({
      where: (t) => eq(t.feedId, original.id),
      columns: { id: true, guid: true, url: true, read: true },
    })
    // Across RSS/Atom formats GUIDs may change. Preserve the existing article
    // by URL as well, including deleted articles and their annotations.
    const missing = selectMissingRepairEntries(existing, preview.entries)
    const inserted = missing.length
      ? await tx
          .insert(entriesTable)
          .values(missing.map((entry) => sanitizeEntryJsonFields(entry as unknown as EntrySchema)))
          .onConflictDoNothing()
          .returning({ id: entriesTable.id })
      : []
    const refreshed = buildRefreshedFeed(current as any, preview.feed)
    await tx
      .update(feedsTable)
      .set({
        url: preview.feed.url,
        title: refreshed.title,
        description: refreshed.description,
        image: refreshed.image,
        siteUrl: refreshed.siteUrl,
        errorAt: null,
        errorMessage: null,
        updatedAt: Date.now(),
      })
      .where(eq(feedsTable.id, original.id))
    return inserted.map((entry) => entry.id)
  })
  // The source repair is committed even if an optional reading rule fails.
  let warning: string | undefined
  try {
    await localReadingPipeline.processNewEntries(addedIds)
  } catch {
    warning = "订阅源已修复，但部分阅读规则未完成，请稍后重试规则"
  }
  return { added: addedIds.length, warning }
}

type Dependencies = {
  read: typeof readFeed
  preview: typeof FeedRefreshService.buildPreviewData
  save: typeof saveRepair
  track: <T>(task: () => Promise<T>) => Promise<T>
}

export class FeedRepairService {
  private requests = new Map<
    string,
    Promise<{ feedId: string; previousUrl: string; url: string; added: number; warning?: string }>
  >()
  private deps: Dependencies
  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      read: readFeed,
      preview: (...args) => FeedRefreshService.buildPreviewData(...args),
      save: saveRepair,
      track: (task) => DBManager.runTrackedOperation(task),
      ...deps,
    }
  }

  repair(feedId: string) {
    if (typeof feedId !== "string" || !feedId.trim())
      return Promise.reject(new Error("订阅 ID 不能为空"))
    const existing = this.requests.get(feedId)
    if (existing) return existing
    const request = this.deps.track(async () => {
      const feed = await this.deps.read(feedId)
      let preview: Preview | undefined
      const failures: string[] = []
      for (const page of getRepairPages(feed)) {
        try {
          const result = await this.deps.preview(page, feedId, false, false, {
            allowScraping: false,
          })
          if (result.entries.length === 0 || !/^https?:\/\//.test(result.feed.url))
            throw new Error("未发现包含文章的 RSS/Atom 订阅源")
          preview = result
          break
        } catch (error) {
          failures.push(`${page}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      if (!preview) throw new Error(`未找到可用订阅源，原订阅保持不变。\n${failures.join("\n")}`)
      const result = await runFeedOperation(feedId, () => this.deps.save(feed, preview!))
      return { feedId, previousUrl: feed.url, url: preview.feed.url, ...result }
    })
    this.requests.set(feedId, request)
    void request
      .finally(() => {
        if (this.requests.get(feedId) === request) this.requests.delete(feedId)
      })
      .catch(() => {})
    return request
  }
}

export const feedRepairService = new FeedRepairService()
