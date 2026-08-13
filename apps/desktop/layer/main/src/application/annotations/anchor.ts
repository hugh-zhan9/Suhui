export type HighlightAnchor = {
  quote: string
  prefix: string
  suffix: string
  startOffset: number | null
  endOffset: number | null
  status: "active" | "orphaned"
}

const decodeHtmlEntities = (value: string) =>
  value.replace(/&(?:#(\d+)|#x([\da-f]+)|nbsp|amp|quot|apos|lt|gt);/gi, (entity, decimal, hex) => {
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
  })

export const articleText = (html: string) =>
  decodeHtmlEntities(
    html.replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " "),
  )
    .replace(/[\t\r ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

type HighlightInput = {
  quote: string
  prefix?: string
  suffix?: string
  startOffset?: number | null
  endOffset?: number | null
}

export const createHighlightAnchor = (text: string, input: HighlightInput): HighlightAnchor => {
  const quote = input.quote.trim().replace(/\s+/g, " ")
  if (!quote) throw new Error("Highlight quote is empty")
  let start = input.startOffset ?? null
  let end = input.endOffset ?? null
  if (start === null || end === null || text.slice(start, end) !== quote) {
    start = locateHighlight(text, quote, input)
    if (start === null) throw new Error("Highlight quote cannot be located")
    end = start + quote.length
  }
  return {
    quote,
    prefix: text.slice(Math.max(0, start - 64), start),
    suffix: text.slice(end, end + 64),
    startOffset: start,
    endOffset: end,
    status: "active",
  }
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
    prefix: input.prefix?.replace(/\s+/g, " ") ?? "",
    suffix: input.suffix?.replace(/\s+/g, " ") ?? "",
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

const contextScore = (text: string, start: number, anchor: HighlightAnchor) => {
  let prefixScore = 0
  const actualPrefix = text.slice(Math.max(0, start - anchor.prefix.length), start)
  for (let index = 1; index <= Math.min(actualPrefix.length, anchor.prefix.length); index++) {
    if (actualPrefix.at(-index) !== anchor.prefix.at(-index)) break
    prefixScore += 1
  }
  let suffixScore = 0
  const quoteEnd = start + anchor.quote.length
  const actualSuffix = text.slice(quoteEnd, quoteEnd + anchor.suffix.length)
  for (let index = 0; index < Math.min(actualSuffix.length, anchor.suffix.length); index++) {
    if (actualSuffix[index] !== anchor.suffix[index]) break
    suffixScore += 1
  }
  return prefixScore + suffixScore
}

export const relocateHighlightAnchor = (text: string, anchor: HighlightAnchor): HighlightAnchor => {
  if (
    anchor.startOffset !== null &&
    anchor.endOffset !== null &&
    text.slice(anchor.startOffset, anchor.endOffset) === anchor.quote
  ) {
    return { ...anchor, status: "active" }
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
    return {
      ...anchor,
      startOffset: matches[0]!,
      endOffset: matches[0]! + anchor.quote.length,
      status: "active",
    }
  }

  const ranked = matches
    .map((start) => ({ start, score: contextScore(text, start, anchor) }))
    .sort((left, right) => right.score - left.score || left.start - right.start)
  if (ranked[0]!.score === 0 || ranked[0]!.score === ranked[1]!.score) {
    return { ...anchor, startOffset: null, endOffset: null, status: "orphaned" }
  }
  return {
    ...anchor,
    startOffset: ranked[0]!.start,
    endOffset: ranked[0]!.start + anchor.quote.length,
    status: "active",
  }
}
