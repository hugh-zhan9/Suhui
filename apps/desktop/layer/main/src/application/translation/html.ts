import { DOMParser } from "linkedom/worker"

const EXCLUDED_ELEMENT_SELECTOR = "pre,code,script,style,noscript,svg,math"

const parse = (html: string) =>
  new DOMParser().parseFromString(
    `<!doctype html><html><head></head><body>${html}</body></html>`,
    "text/html",
  )

type TextSlot = {
  node: Node
  leadingWhitespace: string
  source: string
  trailingWhitespace: string
}

const collectTextSlots = (document: ReturnType<typeof parse>) => {
  const slots: TextSlot[] = []
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      const value = node.textContent ?? ""
      const match = value.match(/^(\s*)([\s\S]*?\S)(\s*)$/)
      const source = match?.[2] ?? ""
      if (/[\p{L}\p{N}]/u.test(source)) {
        slots.push({
          node,
          leadingWhitespace: match?.[1] ?? "",
          source,
          trailingWhitespace: match?.[3] ?? "",
        })
      }
      return
    }
    if (node.nodeType === 1 && (node as Element).matches(EXCLUDED_ELEMENT_SELECTOR)) return
    for (const child of node.childNodes) visit(child)
  }
  visit(document.body)
  return slots
}

export type HtmlTranslationPlan = {
  units: string[]
  rebuild: (translations: string[]) => string
}

export const createHtmlTranslationPlan = (html: string): HtmlTranslationPlan => {
  const document = parse(html)
  const slots = collectTextSlots(document)
  return {
    units: slots.map((slot) => slot.source),
    rebuild: (translations) => {
      if (translations.length !== slots.length) {
        throw new Error("翻译结果与原文文本节点数量不匹配")
      }
      slots.forEach((slot, index) => {
        slot.node.textContent = `${slot.leadingWhitespace}${translations[index]!}${slot.trailingWhitespace}`
      })
      return document.body.innerHTML
    },
  }
}

export const batchTranslationUnits = (units: string[], maxCharacters = 18_000) => {
  const batches: string[][] = []
  let current: string[] = []
  let currentLength = 0
  for (const unit of units) {
    if (current.length > 0 && currentLength + unit.length > maxCharacters) {
      batches.push(current)
      current = []
      currentLength = 0
    }
    current.push(unit)
    currentLength += unit.length
  }
  if (current.length > 0) batches.push(current)
  return batches
}
