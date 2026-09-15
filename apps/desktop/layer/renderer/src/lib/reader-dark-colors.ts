import type { Element, Root, RootContent } from "hast"

const protectedTags = new Set([
  "pre",
  "code",
  "svg",
  "math",
  "img",
  "picture",
  "video",
  "iframe",
  "canvas",
])
const colorProperties = [
  "color",
  "background",
  "background-color",
  "background-image",
  "-webkit-text-fill-color",
  "text-shadow",
  "opacity",
  "filter",
]

/** Copy only changed nodes: cached source trees still render unchanged in light mode. */
export const normalizeReaderDarkColors = (tree: Root): Root => {
  const parser = document.createElement("span")
  const visit = (node: RootContent): RootContent => {
    if (node.type !== "element" || protectedTags.has(node.tagName)) return node
    let properties = node.properties
    if (typeof properties.style === "string") {
      parser.style.cssText = properties.style
      for (const property of colorProperties) parser.style.removeProperty(property)
      properties = { ...properties, style: parser.style.cssText }
    }
    const children = node.children.map((child) =>
      visit(child as RootContent),
    ) as Element["children"]
    return { ...node, properties, children }
  }
  return { ...tree, children: tree.children.map(visit) }
}

const root = '#follow-entry-render[data-reader-dark="true"]'
const text = `${root} :where(p, div, section, article, span, font, li, ul, ol, dl, dt, dd, blockquote, h1, h2, h3, h4, h5, h6, strong, b, em, i, a, table, thead, tbody, tr, td, th, figure, figcaption):not(:where(pre *, code *, svg *, math *))`
export const readerDarkColorStyles = `
${root} { color: var(--tw-prose-body, #d1d5db) !important; background-color: transparent !important; }
${text} { color: inherit !important; -webkit-text-fill-color: currentColor !important; background-color: transparent !important; background-image: none !important; text-shadow: none !important; opacity: 1 !important; }
${root} a:not(:where(pre *, code *, svg *, math *)) { color: var(--tw-prose-links, #93c5fd) !important; }
`
