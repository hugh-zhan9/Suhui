import { DOMParser } from "linkedom/worker"

const EXCLUDED_ELEMENT_SELECTOR = "pre,code,script,style,noscript,svg,math"
const PARAGRAPH_ELEMENTS = new Set(
  "ADDRESS ARTICLE ASIDE BLOCKQUOTE DD DIV DL DT FIGCAPTION FIGURE FOOTER H1 H2 H3 H4 H5 H6 HEADER HR LI MAIN NAV OL P SECTION TABLE TBODY TD TFOOT TH THEAD TR UL BR PRE".split(
    " ",
  ),
)

const LARGE_PARAGRAPH_CHARACTERS = 2_000

// Keep ordinary paragraphs intact. Only large paragraphs need sentence/word
// boundaries; slices retain their whitespace so they can be joined losslessly.
export const splitTranslationParagraph = (text: string) => {
  const parts: string[] = []
  let start = 0
  while (text.length - start > LARGE_PARAGRAPH_CHARACTERS) {
    const window = text.slice(start, start + LARGE_PARAGRAPH_CHARACTERS)
    let end = 0
    for (const match of window.matchAll(/[.!?。！？；;]["'”’」』）)]*\s*/gu)) {
      end = match.index + match[0].length
    }
    if (!end) {
      for (const match of window.matchAll(/\s+/gu)) end = match.index + match[0].length
    }
    if (!end) {
      end = window.length
      // A long unbroken word may need a hard split, but not inside a surrogate pair.
      if (/[\uD800-\uDBFF]/u.test(window[end - 1]!)) end -= 1
    }
    parts.push(text.slice(start, start + end))
    start += end
  }
  if (start < text.length) parts.push(text.slice(start))
  return parts
}

const parse = (html: string) =>
  new DOMParser().parseFromString(
    `<!doctype html><html><head></head><body>${html}</body></html>`,
    "text/html",
  )

type TextSlot = {
  node: Node
  fragments: Array<{
    start: number
    source: string
    index?: number
    leadingWhitespace?: string
    trailingWhitespace?: string
  }>
}

type ParagraphSlice = {
  slot: TextSlot
  start: number
  source: string
}

const collectTextSlots = (document: ReturnType<typeof parse>) => {
  const slots: TextSlot[] = []
  const paragraphs: ParagraphSlice[][] = []
  let paragraph: ParagraphSlice[] = []
  const finishParagraph = () => {
    if (paragraph.length > 0) paragraphs.push(paragraph)
    paragraph = []
  }
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      const value = node.textContent ?? ""
      const slot: TextSlot = { node, fragments: [] }
      slots.push(slot)
      let start = 0
      value.split(/(\r?\n[\t \r]*\n[\t \r\n]*)/u).forEach((source, index) => {
        if (index % 2 === 1) {
          finishParagraph()
          slot.fragments.push({ start, source })
        } else if (source) {
          paragraph.push({ slot, start, source })
        }
        start += source.length
      })
      return
    }
    const element = node.nodeType === 1 ? (node as Element) : undefined
    const isParagraph = element && PARAGRAPH_ELEMENTS.has(element.tagName)
    if (isParagraph) finishParagraph()
    if (element?.matches(EXCLUDED_ELEMENT_SELECTOR)) return
    for (const child of node.childNodes) visit(child)
    if (isParagraph) finishParagraph()
  }
  visit(document.body)
  finishParagraph()
  return { slots, paragraphs }
}

export type HtmlTranslationPlan = {
  units: string[]
  batches: string[][]
  rebuild: (translations: string[]) => string
  rebuildPartial: (translations: Array<string | null | undefined>) => string
}

export const createHtmlTranslationPlan = (html: string): HtmlTranslationPlan => {
  const document = parse(html)
  // Entity decoding can create adjacent text nodes. Merge them before assigning
  // translation slots, without crossing element boundaries or losing punctuation.
  document.body.normalize()
  const { slots, paragraphs } = collectTextSlots(document)
  const units: string[] = []
  const batches: string[][] = []
  for (const paragraph of paragraphs) {
    const text = paragraph.map((slice) => slice.source).join("")
    let sliceIndex = 0
    let sliceOffset = 0
    for (const part of splitTranslationParagraph(text)) {
      const batch: string[] = []
      let remaining = part.length
      while (remaining > 0) {
        const slice = paragraph[sliceIndex]!
        const length = Math.min(remaining, slice.source.length - sliceOffset)
        const source = slice.source.slice(sliceOffset, sliceOffset + length)
        const translatable = source.trim()
        const fragment: TextSlot["fragments"][number] = {
          start: slice.start + sliceOffset,
          source,
        }
        if (/[\p{L}\p{N}]/u.test(translatable)) {
          fragment.index = units.length
          const textStart = source.indexOf(translatable)
          fragment.leadingWhitespace = source.slice(0, textStart)
          fragment.trailingWhitespace = source.slice(textStart + translatable.length)
          units.push(translatable)
          batch.push(translatable)
        }
        slice.slot.fragments.push(fragment)
        sliceOffset += length
        remaining -= length
        if (sliceOffset === slice.source.length) {
          sliceIndex += 1
          sliceOffset = 0
        }
      }
      if (batch.length > 0) batches.push(batch)
    }
  }
  for (const slot of slots) slot.fragments.sort((a, b) => a.start - b.start)
  const applyTranslations = (translations: Array<string | null | undefined>) => {
    slots.forEach((slot) => {
      slot.node.textContent = slot.fragments
        .map((fragment) => {
          const translated = fragment.index === undefined ? null : translations[fragment.index]
          return translated == null
            ? fragment.source
            : `${fragment.leadingWhitespace}${translated}${fragment.trailingWhitespace}`
        })
        .join("")
    })
    return document.body.innerHTML
  }
  return {
    units,
    batches,
    rebuild: (translations) => {
      if (translations.length !== units.length) {
        throw new Error("翻译结果与原文文本节点数量不匹配")
      }
      return applyTranslations(translations)
    },
    rebuildPartial: applyTranslations,
  }
}
