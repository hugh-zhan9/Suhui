import { FeedService } from "@suhui/database/services/feed"

import { DBManager } from "~/manager/db"

import { subscriptionApplicationService } from "../subscription/service"
import { generateOpml, normalizeOpmlFeedUrl, type OpmlSubscription, parseOpml } from "./format"

type OpmlServiceDependencies = {
  list(): Promise<OpmlSubscription[]>
  create(subscription: OpmlSubscription): Promise<unknown>
}

const defaultDependencies: OpmlServiceDependencies = {
  async list() {
    const [feeds, subscriptions] = await Promise.all([
      FeedService.getFeedAll(),
      subscriptionApplicationService.listSubscriptions(),
    ])
    const feedsById = new Map(feeds.map((feed) => [feed.id, feed]))
    return subscriptions.flatMap((subscription) => {
      if (!subscription.feedId) return []
      const feed = feedsById.get(subscription.feedId)
      if (!feed?.url) return []
      return [
        {
          url: feed.url,
          title: subscription.title || feed.title || null,
          category: subscription.category || null,
          htmlUrl: feed.siteUrl || null,
        },
      ]
    })
  },
  create(subscription) {
    return subscriptionApplicationService.createSubscription({
      url: subscription.url,
      title: subscription.title ?? undefined,
      category: subscription.category ?? undefined,
      view: 1,
    })
  },
}

export class OpmlApplicationService {
  constructor(private readonly dependencies: OpmlServiceDependencies = defaultDependencies) {}

  async preview(xml: string) {
    const [parsed, existing] = await Promise.all([parseOpml(xml), this.dependencies.list()])
    const existingUrls = new Set(existing.map((item) => normalizeOpmlFeedUrl(item.url)))
    const seen = new Set<string>()
    return parsed.map((item, index) => {
      const normalizedUrl = normalizeOpmlFeedUrl(item.url)
      const duplicate = existingUrls.has(normalizedUrl) || seen.has(normalizedUrl)
      seen.add(normalizedUrl)
      return { ...item, index, normalizedUrl, duplicate }
    })
  }

  async import(xml: string, selectedIndexes?: number[]) {
    return DBManager.runTrackedOperation(() => this.importUnlocked(xml, selectedIndexes))
  }

  private async importUnlocked(xml: string, selectedIndexes?: number[]) {
    const preview = await this.preview(xml)
    const selected = selectedIndexes ? new Set(selectedIndexes) : null
    let imported = 0
    let skipped = 0
    for (const item of preview) {
      if ((selected && !selected.has(item.index)) || item.duplicate) {
        skipped += 1
        continue
      }
      await this.dependencies.create(item)
      imported += 1
    }
    return { imported, skipped, total: preview.length }
  }

  async export() {
    return generateOpml(await this.dependencies.list())
  }
}

export const opmlApplicationService = new OpmlApplicationService()
