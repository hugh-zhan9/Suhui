import type {
  AgentEntriesListResult,
  AgentEntryDetail,
  AgentFeedListItem,
  AgentFeedsListResult,
  AgentEntryListItem,
} from "./types.js"

type DetailMarkdownOptions = {
  maxChars?: number | undefined
}

const titleOrUntitled = (title: string | null | undefined) => title?.trim() || "(Untitled)"

const valueOrUnknown = (value: string | null | undefined) => value?.trim() || "Unknown"

const formatReadState = (read: boolean) => (read ? "read" : "unread")

const pushOptional = (lines: string[], label: string, value: string | null | undefined) => {
  const trimmed = value?.trim()
  if (trimmed) lines.push(`- ${label}: ${trimmed}`)
}

export const formatJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

const formatEntryMetadata = (entry: AgentEntryListItem) => {
  const lines = [
    `- Feed: ${valueOrUnknown(entry.feedTitle)}`,
    `- ID: \`${entry.id}\``,
    `- State: ${formatReadState(entry.read)}`,
    `- Published: ${valueOrUnknown(entry.publishedAtIso)}`,
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
    lines.push(`## ${titleOrUntitled(item.title)}`)
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
  const lines = [`# ${titleOrUntitled(detail.title)}`, ""]

  lines.push(...formatEntryMetadata(detail))
  lines.push(`- Content source: ${detail.contentSource}`)
  pushOptional(lines, "Description", detail.description)
  lines.push("")

  const content = truncateText(htmlToMarkdown(detail.content), options.maxChars)
  lines.push(content || "No content available.")
  lines.push("")

  return `${lines.join("\n").trimEnd()}\n`
}

const formatFeedMetadata = (feed: AgentFeedListItem) => {
  const lines = [`- ID: \`${feed.id}\``, `- Unread: ${feed.unreadCount}`]
  pushOptional(lines, "Category", feed.category)
  pushOptional(lines, "Site URL", feed.siteUrl)
  pushOptional(lines, "Feed URL", feed.url)
  return lines
}

export const formatFeedsMarkdown = (result: AgentFeedsListResult) => {
  const lines = ["# Suhui Feeds", ""]

  if (result.items.length === 0) {
    lines.push("No feeds found.")
  }

  for (const feed of result.items) {
    lines.push(`## ${titleOrUntitled(feed.title)}`)
    lines.push(...formatFeedMetadata(feed))
    lines.push("")
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

const stripTags = (value: string) => value.replace(/<[^>]+>/gu, "")

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")

const extractPreBlocks = (html: string) => {
  const blocks: string[] = []
  const nextHtml = html.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/giu, (_match, content: string) => {
    const code = decodeEntities(stripTags(content)).trim()
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

  return collapseMarkdownWhitespace(decodeEntities(stripTags(restorePreBlocks(markdown, blocks))))
}
