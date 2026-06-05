import type {
  AgentEntriesListResult,
  AgentEntryDetail,
  AgentFeedListItem,
  AgentFeedsListResult,
  AgentEntryListItem,
  AgentReadStatusResult,
  CliError,
  ContentMode,
  OutputFormat,
} from "./types.js"

type DetailMarkdownOptions = {
  content?: ContentMode | undefined
  maxChars?: number | undefined
}

const titleOrUntitled = (title: string | null | undefined) => title?.trim() || "(Untitled)"

const valueOrUnknown = (value: string | null | undefined) => value?.trim() || "Unknown"

const formatReadState = (read: boolean) => (read ? "read" : "unread")

const formatLocalTime = (
  timestamp: number | null | undefined,
  fallback: string | null | undefined,
) => {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    return new Date(timestamp).toLocaleString()
  }
  return valueOrUnknown(fallback)
}

const stableInline = (value: string | null | undefined, fallback = "Unknown") => {
  const normalized = value?.replace(/\s+/gu, " ").trim()
  return normalized || fallback
}

const stableHeading = (value: string | null | undefined, fallback = "(Untitled)") =>
  stableInline(value, fallback)

const pushOptional = (lines: string[], label: string, value: string | null | undefined) => {
  const trimmed = stableInline(value, "")
  if (trimmed) lines.push(`- ${label}: ${trimmed}`)
}

export const formatJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

const formatEntryMetadata = (entry: AgentEntryListItem) => {
  const lines = [
    `- Feed: ${stableInline(entry.feedTitle)}`,
    `- ID: \`${entry.id}\``,
    `- State: ${formatReadState(entry.read)}`,
    `- Published: ${formatLocalTime(entry.publishedAt, entry.publishedAtIso)}`,
  ]

  pushOptional(lines, "URL", entry.url)
  pushOptional(lines, "Author", entry.author)
  return lines
}

export const formatEntriesListMarkdown = (result: AgentEntriesListResult) => {
  const lines = ["# Suhui Entries", ""]

  if (result.items.length === 0) {
    lines.push("No entries found.")
  }

  for (const item of result.items) {
    lines.push(`## ${stableHeading(item.title)}`)
    lines.push(...formatEntryMetadata(item))
    pushOptional(lines, "Summary", item.summary)
    lines.push("")
  }

  if (result.page.nextCursor) {
    lines.push(`Next cursor: \`${result.page.nextCursor}\``)
    lines.push("")
  }

  return `${lines.join("\n").trimEnd()}\n`
}

export const formatEntryDetailMarkdown = (
  detail: AgentEntryDetail,
  options: DetailMarkdownOptions = {},
) => {
  const lines = [`# ${stableHeading(detail.title)}`, ""]
  const contentMode = options.content ?? "full"

  lines.push(...formatEntryMetadata(detail))
  lines.push(`- Content source: ${detail.contentSource}`)
  if (contentMode !== "metadata") {
    pushOptional(lines, "Description", detail.description)
  }
  lines.push("")

  if (contentMode === "summary") {
    lines.push(detail.description?.trim() || "No summary available.")
    lines.push("")
  } else if (contentMode === "full") {
    const content = truncateText(htmlToMarkdown(detail.content), options.maxChars)
    lines.push(content || "No content available.")
    lines.push("")
  }

  return `${lines.join("\n").trimEnd()}\n`
}

const formatFeedMetadata = (feed: AgentFeedListItem) => {
  const lines = [`- ID: \`${feed.id}\``, `- Unread: ${feed.unreadCount}`]
  pushOptional(lines, "Site URL", feed.siteUrl)
  pushOptional(lines, "Feed URL", feed.url)
  return lines
}

export const formatFeedsMarkdown = (result: AgentFeedsListResult) => {
  const lines = ["# Suhui Feeds", ""]

  if (result.items.length === 0) {
    lines.push("No feeds found.")
  }

  const feedsByCategory = new Map<string, AgentFeedListItem[]>()
  for (const feed of result.items) {
    const category = feed.category?.trim() || "Uncategorized"
    feedsByCategory.set(category, [...(feedsByCategory.get(category) ?? []), feed])
  }

  const sortedCategories = Array.from(feedsByCategory.keys()).sort((a, b) => a.localeCompare(b))
  for (const category of sortedCategories) {
    lines.push(`## ${category}`)
    const feeds = [...(feedsByCategory.get(category) ?? [])].sort((a, b) =>
      titleOrUntitled(a.title).localeCompare(titleOrUntitled(b.title)),
    )
    for (const feed of feeds) {
      lines.push(`### ${stableHeading(feed.title)}`)
      lines.push(...formatFeedMetadata(feed))
      lines.push("")
    }
  }

  return `${lines.join("\n").trimEnd()}\n`
}

export const truncateText = (value: string, maxChars?: number) => {
  if (typeof maxChars !== "number" || !Number.isFinite(maxChars) || maxChars <= 0) return value
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.trunc(maxChars))}\n\n[Content truncated to ${Math.trunc(
    maxChars,
  )} characters]`
}

const decodeEntities = (value: string) =>
  value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&#x27;/giu, "'")

const stripTags = (value: string) =>
  value.replace(/<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*)?>/gu, "")

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")

const extractPreBlocks = (html: string) => {
  const blocks: string[] = []
  const nextHtml = html.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/giu, (_match, content: string) => {
    const code = decodeEntities(
      content.replace(/^\s*<code\b[^>]*>/iu, "").replace(/<\/code>\s*$/iu, ""),
    ).trim()
    const placeholder = `__SUHUI_PRE_BLOCK_${blocks.length}__`
    blocks.push(`\n\n\`\`\`\n${code}\n\`\`\`\n\n`)
    return placeholder
  })
  return { html: nextHtml, blocks }
}

const restorePreBlocks = (markdown: string, blocks: string[]) => {
  let result = markdown
  blocks.forEach((block, index) => {
    result = result.replace(new RegExp(escapeRegExp(`__SUHUI_PRE_BLOCK_${index}__`), "gu"), block)
  })
  return result
}

const collapseMarkdownWhitespace = (value: string) =>
  value
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/gu, ""))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()

export const htmlToMarkdown = (html: string) => {
  if (!html.trim()) return ""

  const { html: withoutPre, blocks } = extractPreBlocks(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ""),
  )

  const markdown = withoutPre
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/giu, (_match, content: string) => {
      return `\n\n# ${stripTags(content).trim()}\n\n`
    })
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/giu, (_match, content: string) => {
      return `\n\n## ${stripTags(content).trim()}\n\n`
    })
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/giu, (_match, content: string) => {
      return `\n\n### ${stripTags(content).trim()}\n\n`
    })
    .replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/giu, (_match, content: string) => {
      return `\n\n#### ${stripTags(content).trim()}\n\n`
    })
    .replace(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu,
      (_match, href: string, text: string) => {
        const label = stripTags(text).trim() || href
        return `[${label}](${href})`
      },
    )
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/p>/giu, "\n\n")
    .replace(/<p\b[^>]*>/giu, "")
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/giu, (_match, content: string) => {
      return `\n- ${stripTags(content).trim()}`
    })
    .replace(/<\/?(ul|ol|article|section|div|main|body|html|blockquote)\b[^>]*>/giu, "\n")
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/giu, (_match, content: string) => {
      return `\`${stripTags(content).trim()}\``
    })

  return collapseMarkdownWhitespace(decodeEntities(restorePreBlocks(stripTags(markdown), blocks)))
}

export const formatReadStatusMarkdown = (result: AgentReadStatusResult) => {
  const noun = result.updated === 1 ? "entry" : "entries"
  return `Updated ${result.updated} ${noun} to ${result.read ? "read" : "unread"}.\n`
}

export const formatError = (error: CliError, format: OutputFormat) => {
  if (format === "json") {
    return formatJson({
      error: {
        code: error.code,
        message: error.message,
      },
    })
  }
  return `Error: ${stableInline(error.message, "Unknown error")}\n`
}
