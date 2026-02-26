type ParsedItem = {
  title: string
  url: string
  content: string
  description: string
  guid: string
  author: string
  publishedAt: number
}

export type ParsedFeed = {
  title: string
  description: string
  siteUrl: string
  image: string
  items: ParsedItem[]
}

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim()

const decodeEntities = (value: string) =>
  value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")

const stripHtml = (value: string) =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")

const toPlainText = (value: string) => normalizeWhitespace(decodeEntities(stripHtml(value || "")))

const removeTitlePrefix = (title: string, text: string) => {
  const normalizedTitle = normalizeWhitespace(title)
  const normalizedText = normalizeWhitespace(text)
  if (!normalizedTitle || !normalizedText) return normalizedText

  if (normalizedText === normalizedTitle) return ""

  const escapedTitle = normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const prefix = new RegExp(`^${escapedTitle}[\\s:：\\-—|·,，。!?！？]*`, "i")
  return normalizeWhitespace(normalizedText.replace(prefix, ""))
}

const pickDescription = (title: string, ...candidates: Array<string | null | undefined>) => {
  for (const candidate of candidates) {
    const plain = toPlainText(candidate || "")
    if (!plain) continue

    const withoutTitle = removeTitlePrefix(title, plain)
    return withoutTitle || plain
  }
  return ""
}

const pickTimestamp = (raw: string) => {
  const timestamp = raw ? new Date(raw).getTime() : Date.now()
  return Number.isNaN(timestamp) ? Date.now() : timestamp
}

const cleanupTagText = (value: string) => {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .trim()
}

const escapeTagName = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const findTagText = (xml: string, tagNames: string[]) => {
  for (const name of tagNames) {
    const escaped = escapeTagName(name)
    const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"))
    if (match?.[1]) return cleanupTagText(match[1])
  }
  return ""
}

const findBlocks = (xml: string, tagName: string) => {
  const escaped = escapeTagName(tagName)
  const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "gi")
  const result: string[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) {
    if (match[1]) result.push(match[1])
  }
  return result
}

const parseAttributes = (raw: string) => {
  const attrs: Record<string, string> = {}
  const re = /([:@A-Za-z0-9_-]+)\s*=\s*(["'])(.*?)\2/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw))) {
    attrs[match[1]] = decodeEntities(match[3] || "")
  }
  return attrs
}

const findLinkHref = (xml: string, preferredRel?: string) => {
  const re = /<link\b([^>]*)\/?>/gi
  let firstHref = ""
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) {
    const attrs = parseAttributes(match[1] || "")
    const href = attrs.href?.trim()
    if (!href) continue
    if (!firstHref) firstHref = href
    if (!preferredRel || attrs.rel === preferredRel) return href
  }
  return firstHref
}

const parseRss = (channelXml: string): ParsedFeed => {
  const title = findTagText(channelXml, ["title"])
  const description = pickDescription(title, findTagText(channelXml, ["description"]))
  const siteUrl = findTagText(channelXml, ["link"])
  const imageBlock = findBlocks(channelXml, "image")[0] || ""
  const image = findTagText(imageBlock, ["url"]) || findTagText(channelXml, ["logo"])

  const items: ParsedItem[] = findBlocks(channelXml, "item").map((itemXml) => {
    const itemTitle = findTagText(itemXml, ["title"])
    const rawDescription = findTagText(itemXml, ["description"])
    const rawContent =
      findTagText(itemXml, ["content:encoded", "encoded", "content"]) || rawDescription

    const url = findTagText(itemXml, ["link"])
    const guid =
      findTagText(itemXml, ["guid", "id"]) ||
      url ||
      `guid_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const author = findTagText(itemXml, ["dc:creator", "author", "name"])
    const pubDate = findTagText(itemXml, ["pubDate", "published", "updated"])

    return {
      title: itemTitle || "",
      url: url || "",
      content: rawContent || "",
      description: pickDescription(itemTitle || "", rawDescription, rawContent),
      guid,
      author: author || "",
      publishedAt: pickTimestamp(pubDate),
    }
  })

  return { title, description, siteUrl, image, items }
}

const parseAtom = (feedXml: string): ParsedFeed => {
  const title = findTagText(feedXml, ["title"])
  const description = pickDescription(title, findTagText(feedXml, ["subtitle"]))
  const siteUrl = findLinkHref(feedXml, "alternate") || findTagText(feedXml, ["link"])
  const image = findTagText(feedXml, ["logo"])

  const items: ParsedItem[] = findBlocks(feedXml, "entry").map((entryXml) => {
    const itemTitle = findTagText(entryXml, ["title"])
    const rawSummary = findTagText(entryXml, ["summary"])
    const rawContent = findTagText(entryXml, ["content"]) || rawSummary
    const url = findLinkHref(entryXml, "alternate") || findTagText(entryXml, ["link"])
    const guid =
      findTagText(entryXml, ["id", "guid"]) ||
      url ||
      `guid_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const authorBlock = findBlocks(entryXml, "author")[0] || ""
    const author = findTagText(authorBlock || entryXml, ["name", "author"])
    const pubDate = findTagText(entryXml, ["published", "updated"])

    return {
      title: itemTitle || "",
      url: url || "",
      content: rawContent || "",
      description: pickDescription(itemTitle || "", rawSummary, rawContent),
      guid,
      author: author || "",
      publishedAt: pickTimestamp(pubDate),
    }
  })

  return { title, description, siteUrl, image, items }
}

export const parseRssFeed = (xml: string): ParsedFeed => {
  const input = (xml || "").trim()
  if (!input.startsWith("<") || !input.includes(">")) {
    throw new Error("Invalid feed XML")
  }

  const channelXml = findBlocks(input, "channel")[0]
  if (channelXml) return parseRss(channelXml)

  const feedXml = findBlocks(input, "feed")[0]
  if (feedXml) return parseAtom(feedXml)

  throw new Error("Unsupported feed format")
}
