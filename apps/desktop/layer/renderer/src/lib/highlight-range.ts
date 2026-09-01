/**
 * Maps stored highlight anchors onto the rendered article DOM.
 *
 * Highlights are anchored in the main process against a whitespace-collapsed plain
 * text projection of the entry HTML (`application/annotations/anchor.ts`). The rendered
 * DOM keeps neither those offsets nor that whitespace, so the quote is re-located
 * against an equivalent projection rebuilt from the live text nodes.
 */

export type LocatableHighlight = {
  quote: string
  prefix?: string | null
  suffix?: string | null
}

type TextPosition = { node: Text; offset: number }

type TextIndex = { text: string; positions: TextPosition[] }

const WHITESPACE = /\s/
const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"])

const collapseWhitespace = (value: string) => value.replaceAll(/\s+/g, " ")

const buildTextIndex = (container: Element): TextIndex => {
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement && SKIPPED_TAGS.has(node.parentElement.tagName)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })

  let text = ""
  const positions: TextPosition[] = []

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const { data } = node as Text
    // Walked by UTF-16 code unit so the recorded offsets stay valid for Range boundaries.
    let offset = 0
    while (offset < data.length) {
      const char = data[offset]!
      if (WHITESPACE.test(char)) {
        if (text.length > 0 && !text.endsWith(" ")) {
          text += " "
          positions.push({ node: node as Text, offset })
        }
      } else {
        text += char
        positions.push({ node: node as Text, offset })
      }
      offset += 1
    }
  }

  return { text, positions }
}

const findAllOccurrences = (text: string, quote: string) => {
  const found: number[] = []
  let index = text.indexOf(quote)
  while (index >= 0) {
    found.push(index)
    index = text.indexOf(quote, index + 1)
  }
  return found
}

/**
 * Counts how many characters of the stored context still surround a candidate match,
 * mirroring the scoring the main process uses when it anchors a highlight.
 */
const contextScore = (
  text: string,
  start: number,
  quoteLength: number,
  prefix: string,
  suffix: string,
) => {
  let score = 0

  const actualPrefix = text.slice(Math.max(0, start - prefix.length), start)
  for (let index = 1; index <= Math.min(actualPrefix.length, prefix.length); index++) {
    if (actualPrefix.at(-index) !== prefix.at(-index)) break
    score += 1
  }

  const quoteEnd = start + quoteLength
  const actualSuffix = text.slice(quoteEnd, quoteEnd + suffix.length)
  for (let index = 0; index < Math.min(actualSuffix.length, suffix.length); index++) {
    if (actualSuffix[index] !== suffix[index]) break
    score += 1
  }

  return score
}

const createRange = (index: TextIndex, start: number, end: number) => {
  const first = index.positions[start]
  const last = index.positions[end - 1]
  if (!first || !last) return null

  const range = first.node.ownerDocument.createRange()
  range.setStart(first.node, first.offset)
  range.setEnd(last.node, last.offset + 1)
  return range
}

/**
 * Resolves each highlight to a DOM range inside `container`. Quotes that no longer
 * appear in the rendered text are skipped; a quote that appears several times is
 * painted at the occurrence whose surrounding text best matches the stored context.
 */
export const locateHighlightRanges = (
  container: Element,
  highlights: LocatableHighlight[],
): Range[] => {
  if (highlights.length === 0) return []

  const index = buildTextIndex(container)
  if (!index.text) return []

  const ranges: Range[] = []
  for (const highlight of highlights) {
    const quote = collapseWhitespace(highlight.quote).trim()
    if (!quote) continue

    const occurrences = findAllOccurrences(index.text, quote)
    if (occurrences.length === 0) continue

    let start = occurrences[0]!
    if (occurrences.length > 1) {
      const prefix = collapseWhitespace(highlight.prefix ?? "")
      const suffix = collapseWhitespace(highlight.suffix ?? "")
      let bestScore = -1
      for (const candidate of occurrences) {
        const score = contextScore(index.text, candidate, quote.length, prefix, suffix)
        if (score > bestScore) {
          bestScore = score
          start = candidate
        }
      }
    }

    const range = createRange(index, start, start + quote.length)
    if (range) ranges.push(range)
  }

  return ranges
}
