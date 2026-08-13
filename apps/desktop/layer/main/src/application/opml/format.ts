import { DOMParser } from "linkedom"

export type OpmlSubscription = {
  url: string
  title: string | null
  category: string | null
  htmlUrl: string | null
}

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")

const decodeXmlAttribute = (value: string) =>
  value.replace(/&(?:#(\d+)|#x([\da-f]+)|amp|quot|apos|lt|gt);/gi, (entity, decimal, hex) => {
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10))
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16))
    return (
      {
        "&amp;": "&",
        "&quot;": '"',
        "&apos;": "'",
        "&lt;": "<",
        "&gt;": ">",
      }[entity.toLowerCase()] ?? entity
    )
  })

export const normalizeOpmlFeedUrl = (input: string) => {
  const trimmed = input.trim()
  try {
    const url = new URL(trimmed)
    url.hash = ""
    url.hostname = url.hostname.toLowerCase()
    if (
      (url.protocol === "https:" && url.port === "443") ||
      (url.protocol === "http:" && url.port === "80")
    ) {
      url.port = ""
    }
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "")
    return url.toString()
  } catch {
    return trimmed
  }
}

export function parseOpml(xml: string, maxBytes = 10 * 1024 * 1024): OpmlSubscription[] {
  if (Buffer.byteLength(xml, "utf8") > maxBytes) throw new Error("OPML file exceeds the size limit")
  const document = new DOMParser().parseFromString(xml, "text/xml")
  if (document.documentElement?.localName.toLowerCase() !== "opml") {
    throw new Error("Invalid OPML document")
  }
  const body = document.querySelector("body")
  if (!body) throw new Error("OPML body is missing")

  const results: OpmlSubscription[] = []
  const visit = (element: Element, inheritedCategory: string | null) => {
    const titleValue = element.getAttribute("title") || element.getAttribute("text")
    const title = titleValue ? decodeXmlAttribute(titleValue) : null
    const categoryValue = element.getAttribute("category")
    const ownCategory = categoryValue ? decodeXmlAttribute(categoryValue) : inheritedCategory
    const type = element.getAttribute("type")?.toLowerCase()
    const xmlUrlValue = element.getAttribute("xmlUrl")
    const xmlUrl = xmlUrlValue ? decodeXmlAttribute(xmlUrlValue) : null
    if (xmlUrl && (!type || type === "rss" || type === "atom")) {
      results.push({
        url: xmlUrl.trim(),
        title: title?.trim() || null,
        category: ownCategory?.trim() || null,
        htmlUrl: element.getAttribute("htmlUrl")
          ? decodeXmlAttribute(element.getAttribute("htmlUrl")!).trim()
          : null,
      })
    }
    const nextCategory = xmlUrl ? ownCategory : title?.trim() || ownCategory
    for (const child of Array.from(element.children) as Element[]) visit(child, nextCategory)
  }
  for (const child of Array.from(body.children) as Element[]) visit(child, null)
  return results.filter((item) => item.url)
}

export function generateOpml(subscriptions: OpmlSubscription[], title = "Suhui subscriptions") {
  const groups = new Map<string, OpmlSubscription[]>()
  for (const subscription of subscriptions) {
    const category = subscription.category?.trim() || ""
    const group = groups.get(category) ?? []
    group.push(subscription)
    groups.set(category, group)
  }

  const outlines: string[] = []
  for (const [category, items] of [...groups].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const feedLines = items
      .sort((left, right) => (left.title || left.url).localeCompare(right.title || right.url))
      .map((item) => {
        const name = escapeXml(item.title || item.url)
        const html = item.htmlUrl ? ` htmlUrl="${escapeXml(item.htmlUrl)}"` : ""
        return `      <outline type="rss" text="${name}" title="${name}" xmlUrl="${escapeXml(item.url)}"${html}/>`
      })
    if (category) {
      outlines.push(`    <outline text="${escapeXml(category)}" title="${escapeXml(category)}">`)
      outlines.push(...feedLines)
      outlines.push("    </outline>")
    } else {
      outlines.push(...feedLines.map((line) => line.slice(2)))
    }
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    "  <head>",
    `    <title>${escapeXml(title)}</title>`,
    "  </head>",
    "  <body>",
    ...outlines,
    "  </body>",
    "</opml>",
    "",
  ].join("\n")
}
