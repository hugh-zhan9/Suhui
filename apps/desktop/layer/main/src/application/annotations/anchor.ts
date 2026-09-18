export type HighlightAnchor = {
  quote: string
  prefix: string
  suffix: string
  startOffset: number | null
  endOffset: number | null
  status: "active" | "orphaned"
}

const decodeHtmlEntities = (value: string) =>
  value.replaceAll(
    /&(?:#(\d+)|#x([\da-f]+)|nbsp|amp|quot|apos|lt|gt);/gi,
    (entity, decimal, hex) => {
      if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10))
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16))
      return (
        {
          "&nbsp;": " ",
          "&amp;": "&",
          "&quot;": '"',
          "&apos;": "'",
          "&lt;": "<",
          "&gt;": ">",
        }[entity.toLowerCase()] ?? entity
      )
    },
  )

/**
 * Tags whose boundaries the browser turns into a line break (or a tab, for table cells)
 * when a selection is serialised (`Selection.toString()`), so they become a word
 * separator here. Mirrored by `BLOCK_TAGS` in the renderer's `lib/highlight-range.ts`.
 */
const BLOCK_TAG_PATTERN =
  /<\/?(?:address|article|aside|blockquote|br|caption|center|dd|details|dialog|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hgroup|hr|legend|li|main|menu|nav|ol|p|pre|section|summary|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi

/**
 * Plain-text projection of the entry HTML that highlights are anchored against.
 *
 * It must produce the same string as the renderer does from the live DOM
 * (`lib/highlight-range.ts` and the whitespace-collapsed selection quote): inline tags
 * such as `<code>` or `<strong>` contribute nothing, block boundaries count as one space,
 * and every whitespace run collapses to a single space. Replacing inline tags with a
 * space inserts characters that never exist in the rendered text, which is fatal for
 * CJK prose where no natural whitespace can absorb them.
 */
export const articleText = (html: string) =>
  decodeHtmlEntities(html.replaceAll(BLOCK_TAG_PATTERN, " ").replaceAll(/<[^>]*>/g, ""))
    .replaceAll(/\s+/g, " ")
    .trim()

type HighlightInput = {
  quote: string
  prefix?: string
  suffix?: string
  startOffset?: number | null
  endOffset?: number | null
}

const CONTEXT_LENGTH = 64

/** An active anchor for `quote` at `start`, with its context re-read from the current text. */
const anchorAt = (text: string, quote: string, start: number): HighlightAnchor => {
  const end = start + quote.length
  return {
    quote,
    prefix: text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: text.slice(end, end + CONTEXT_LENGTH),
    startOffset: start,
    endOffset: end,
    status: "active",
  }
}

export const createHighlightAnchor = (text: string, input: HighlightInput): HighlightAnchor => {
  const quote = input.quote.trim().replaceAll(/\s+/g, " ")
  if (!quote) throw new Error("Highlight quote is empty")
  const { startOffset, endOffset } = input
  if (
    startOffset !== null &&
    startOffset !== undefined &&
    endOffset !== null &&
    endOffset !== undefined &&
    text.slice(startOffset, endOffset) === quote
  ) {
    return anchorAt(text, quote, startOffset)
  }
  const start = locateHighlight(text, quote, input)
  if (start === null) throw new Error("Highlight quote cannot be located")
  return anchorAt(text, quote, start)
}

const locateHighlight = (text: string, quote: string, input: HighlightInput) => {
  const matches: number[] = []
  let match = text.indexOf(quote)
  while (match >= 0) {
    matches.push(match)
    match = text.indexOf(quote, match + 1)
  }
  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0]!
  const context = {
    quote,
    prefix: input.prefix ?? "",
    suffix: input.suffix ?? "",
    startOffset: null,
    endOffset: null,
    status: "active" as const,
  }
  const ranked = matches
    .map((candidate) => ({ candidate, score: contextScore(text, candidate, context) }))
    .sort((left, right) => right.score - left.score || left.candidate - right.candidate)
  if (!ranked[0]!.score || ranked[0]!.score === ranked[1]!.score) {
    throw new Error("Highlight quote cannot be located uniquely")
  }
  return ranked[0]!.candidate
}

const WHITESPACE = /\s/

/**
 * Counts how many characters of `context`, read from its boundary inward, match `text`
 * read from `from` in direction `step`. Whitespace is skipped on both sides: stored context
 * may come from the renderer's raw DOM text or from an earlier projection of the entry,
 * and those disagree with the current projection only in whitespace.
 */
const matchingRun = (text: string, from: number, step: -1 | 1, context: string) => {
  let count = 0
  let textIndex = from
  let contextIndex = step < 0 ? context.length - 1 : 0
  while (
    contextIndex >= 0 &&
    contextIndex < context.length &&
    textIndex >= 0 &&
    textIndex < text.length
  ) {
    if (WHITESPACE.test(context[contextIndex]!)) {
      contextIndex += step
      continue
    }
    if (WHITESPACE.test(text[textIndex]!)) {
      textIndex += step
      continue
    }
    if (context[contextIndex] !== text[textIndex]) break
    count += 1
    contextIndex += step
    textIndex += step
  }
  return count
}

const contextScore = (text: string, start: number, anchor: HighlightAnchor) =>
  matchingRun(text, start - 1, -1, anchor.prefix) +
  matchingRun(text, start + anchor.quote.length, 1, anchor.suffix)

/**
 * Re-anchors a stored highlight against the current text. Every active result re-reads
 * prefix/suffix from that text, so context recorded under an older projection is
 * replaced instead of being carried forward; an orphaned result keeps the old context as
 * the only clue left for a later relocation.
 */
export const relocateHighlightAnchor = (text: string, anchor: HighlightAnchor): HighlightAnchor => {
  if (
    anchor.startOffset !== null &&
    anchor.endOffset !== null &&
    text.slice(anchor.startOffset, anchor.endOffset) === anchor.quote
  ) {
    return anchorAt(text, anchor.quote, anchor.startOffset)
  }

  const matches: number[] = []
  let index = text.indexOf(anchor.quote)
  while (index >= 0) {
    matches.push(index)
    index = text.indexOf(anchor.quote, index + 1)
  }
  if (matches.length === 0) {
    return { ...anchor, startOffset: null, endOffset: null, status: "orphaned" }
  }
  if (matches.length === 1) {
    return anchorAt(text, anchor.quote, matches[0]!)
  }

  const ranked = matches
    .map((start) => ({ start, score: contextScore(text, start, anchor) }))
    .sort((left, right) => right.score - left.score || left.start - right.start)
  if (ranked[0]!.score === 0 || ranked[0]!.score === ranked[1]!.score) {
    return { ...anchor, startOffset: null, endOffset: null, status: "orphaned" }
  }
  return anchorAt(text, anchor.quote, ranked[0]!.start)
}
