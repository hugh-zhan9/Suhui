import type { FeedModel } from "@follow/store/feed/types"

type LocalEntry = {
  id: string
  guid: string
  title: string
  url: string
  description: string
  publishedAt: string
}

const LOCAL_EPOCH = 1712546615000n
const MAX_TIMESTAMP_BITS = 41n
const LOWER_BITS = 63n - MAX_TIMESTAMP_BITS
const LOWER_MASK = (1n << LOWER_BITS) - 1n

const toSnowflakeLikeId = () => {
  const now = BigInt(Date.now())
  const tsDelta = now > LOCAL_EPOCH ? now - LOCAL_EPOCH : 0n
  const random = BigInt(Math.floor(Math.random() * Number(LOWER_MASK)))
  return ((tsDelta << LOWER_BITS) | random).toString()
}

const readText = (el: Element | null | undefined, selector: string) =>
  el?.querySelector(selector)?.textContent?.trim() || ""

const pickDate = (raw: string) => {
  const d = raw ? new Date(raw) : new Date()
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

const parseRss = (doc: Document) => {
  const channel = doc.querySelector("rss > channel")
  if (!channel) return null

  const feedTitle = readText(channel, "title") || "Untitled Feed"
  const siteUrl = readText(channel, "link")
  const description = readText(channel, "description")

  const entries: LocalEntry[] = Array.from(channel.querySelectorAll("item"))
    .map((item) => {
      const id = toSnowflakeLikeId()
      const link = readText(item, "link")
      const guid = readText(item, "guid") || id
      return {
        id,
        guid,
        title: readText(item, "title") || "Untitled Entry",
        url: link,
        description: readText(item, "description"),
        publishedAt: pickDate(readText(item, "pubDate")),
      }
    })
    .filter((entry) => !!entry.url)

  return {
    feedTitle,
    siteUrl,
    description,
    entries,
  }
}

const parseAtom = (doc: Document) => {
  const feed = doc.querySelector("feed")
  if (!feed) return null

  const feedTitle = readText(feed, "title") || "Untitled Feed"
  const siteUrl = feed.querySelector("link[rel='alternate']")?.getAttribute("href") || ""
  const description = readText(feed, "subtitle")

  const entries: LocalEntry[] = Array.from(feed.querySelectorAll("entry"))
    .map((entry) => {
      const id = toSnowflakeLikeId()
      const link =
        entry.querySelector("link[rel='alternate']")?.getAttribute("href") ||
        entry.querySelector("link")?.getAttribute("href") ||
        ""
      const guid = readText(entry, "id") || id
      return {
        id,
        guid,
        title: readText(entry, "title") || "Untitled Entry",
        url: link,
        description: readText(entry, "summary") || readText(entry, "content"),
        publishedAt: pickDate(readText(entry, "published") || readText(entry, "updated")),
      }
    })
    .filter((entry) => !!entry.url)

  return {
    feedTitle,
    siteUrl,
    description,
    entries,
  }
}

export const parseLocalFeedText = (text: string, sourceUrl: string) => {
  const parser = new DOMParser()
  const xml = parser.parseFromString(text, "text/xml")
  if (xml.querySelector("parsererror")) {
    throw new Error("Invalid feed XML")
  }

  const parsed = parseRss(xml) || parseAtom(xml)
  if (!parsed) {
    throw new Error("Unsupported feed format")
  }

  const feedId = toSnowflakeLikeId()
  const feed: FeedModel = {
    type: "feed",
    id: feedId,
    title: parsed.feedTitle,
    url: sourceUrl,
    description: parsed.description || null,
    image: null,
    errorAt: null,
    siteUrl: parsed.siteUrl || null,
    ownerUserId: null,
    errorMessage: null,
    subscriptionCount: null,
    updatesPerWeek: null,
    latestEntryPublishedAt: parsed.entries[0]?.publishedAt || null,
    tipUserIds: null,
    updatedAt: null,
  }

  return {
    feed,
    entries: parsed.entries,
  }
}

export const fetchLocalFeedPreview = async (feedUrl: string) => {
  const response = await fetch(feedUrl, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.status}`)
  }

  const text = await response.text()
  const parsed = parseLocalFeedText(text, feedUrl)

  return {
    feed: parsed.feed,
    entries: parsed.entries,
    subscription: undefined,
    analytics: {
      updatesPerWeek: null,
      subscriptionCount: null,
      latestEntryPublishedAt: parsed.feed.latestEntryPublishedAt,
      view: 1,
    },
  }
}

