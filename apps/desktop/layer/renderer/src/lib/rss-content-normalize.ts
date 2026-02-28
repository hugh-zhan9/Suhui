const decodeNumericEntities = (value: string) =>
  value
    .replaceAll(/&#(\d+);/g, (_, dec) => {
      const codePoint = Number.parseInt(dec, 10)
      return Number.isNaN(codePoint) ? _ : String.fromCodePoint(codePoint)
    })
    .replaceAll(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const codePoint = Number.parseInt(hex, 16)
      return Number.isNaN(codePoint) ? _ : String.fromCodePoint(codePoint)
    })

const decodeEntities = (value: string) =>
  decodeNumericEntities(
    value
      .replaceAll("&nbsp;", " ")
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&apos;", "'"),
  )

const decodeEntitiesDeep = (value: string, maxDepth = 4) => {
  let current = value || ""
  for (let index = 0; index < maxDepth; index += 1) {
    const next = decodeEntities(current)
    if (next === current) break
    current = next
  }
  return current
}

const looksLikeHtml = (value: string) => /<([a-z][\w:-]*)(\s|>)/i.test(value)

export const normalizeRssContentForRender = (content?: string | null) => {
  const raw = content || ""
  if (!raw || !raw.includes("&")) return raw

  const decoded = decodeEntitiesDeep(raw)
  if (decoded === raw) return raw

  // 仅在解码后看起来是 HTML 时替换，避免普通文本被误解码
  if (looksLikeHtml(decoded)) return decoded

  return raw
}
