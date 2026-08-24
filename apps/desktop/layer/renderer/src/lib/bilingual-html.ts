import type { TranslationMode } from "@suhui/store/translation/types"

const BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,li,figcaption,td,th,dt,dd,blockquote,div"
const EXCLUDED_ANCESTOR_SELECTOR = "pre,code,script,style,noscript"

const parse = (html: string) =>
  new DOMParser().parseFromString(
    `<!doctype html><html><head></head><body>${html}</body></html>`,
    "text/html",
  )

const leafBlocks = (document: Document) =>
  [...document.querySelectorAll(BLOCK_SELECTOR)].filter((element) => {
    if (element.closest(EXCLUDED_ANCESTOR_SELECTOR)) return false
    if (!(element.textContent ?? "").trim()) return false
    return ![...element.querySelectorAll(BLOCK_SELECTOR)].some(
      (child) => (child.textContent ?? "").trim().length > 0,
    )
  })

const stripDuplicatedMedia = (element: Element) => {
  for (const media of element.querySelectorAll(
    "img,picture,source,video,audio,iframe,canvas,svg,pre,code",
  )) {
    media.remove()
  }
}

export const buildBilingualHtml = (
  sourceHtml: string,
  translatedHtml: string,
  language = "zh-CN",
) => {
  if (!translatedHtml.trim() || sourceHtml === translatedHtml) return sourceHtml
  const sourceDocument = parse(sourceHtml)
  const translatedDocument = parse(translatedHtml)
  const sourceBlocks = leafBlocks(sourceDocument)
  const translatedBlocks = leafBlocks(translatedDocument)

  if (sourceBlocks.length === 0 || sourceBlocks.length !== translatedBlocks.length) {
    return `${sourceHtml}<div class="suhui-bilingual-translation" data-suhui-translation="true">${translatedHtml}</div>`
  }

  sourceBlocks.forEach((source, index) => {
    const translated = translatedBlocks[index]!
    if ((source.textContent ?? "").trim() === (translated.textContent ?? "").trim()) return
    const sourceTag = source.tagName.toLowerCase()
    const translation = source.ownerDocument.createElement(
      sourceTag === "li" || sourceTag === "td" || sourceTag === "th" ? "div" : sourceTag,
    )
    translation.innerHTML = translated.innerHTML
    stripDuplicatedMedia(translation)
    if (!(translation.textContent ?? "").trim()) return
    translation.className = "suhui-bilingual-translation"
    translation.setAttribute("data-suhui-translation", "true")
    translation.setAttribute("lang", language)
    if (sourceTag === "li" || sourceTag === "td" || sourceTag === "th") {
      source.append(translation)
    } else {
      source.after(translation)
    }
  })
  return sourceDocument.body.innerHTML
}

export const resolveTranslationHtml = ({
  sourceHtml,
  translatedHtml,
  mode,
  language,
}: {
  sourceHtml: string
  translatedHtml?: string | null
  mode: TranslationMode
  language?: string
}) => {
  if (!translatedHtml?.trim()) return sourceHtml
  return mode === "translation-only"
    ? translatedHtml
    : buildBilingualHtml(sourceHtml, translatedHtml, language)
}
