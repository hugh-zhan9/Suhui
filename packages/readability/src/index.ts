import { Readability } from "@mozilla/readability"
import chardet from "chardet"
import DOMPurify from "dompurify"
import { parseHTML } from "linkedom/worker"

const isDev = process.env.NODE_ENV === "development"

const userAgents =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"

// Mozilla's own video host list plus the ones this reader actually meets.
// Readability matches it unanchored, against attribute values and inner HTML.
const ALLOWED_VIDEO_HOST =
  /\/\/(www\.)?((dailymotion|youtube|youtube-nocookie|player\.vimeo|v\.qq|player\.bilibili)\.com|(archive|upload\.wikimedia)\.org|player\.twitch\.tv)/i

// The same hosts as exact embed endpoints. DOMPurify drops every iframe by
// default, which turned an article built around a video into a heading above a
// blank gap; this is what gets to stay. Anchored, because extracted markup
// comes from arbitrary pages and a substring match would accept
// `https://evil.example/?x=//player.bilibili.com/player.html`.
const VIDEO_EMBED_SRC =
  /^(?:https?:)?\/\/(?:www\.)?(?:youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/|player\.bilibili\.com\/player\.html|player\.vimeo\.com\/video\/)/

// For avoiding xss attack from readability, the raw document string should be sanitized.
// The xss attack in electron may lead to more serious outcomes than browser environment.
// It may allows remotely execute malicious scripts in main process.
// Before the sanitizing, the DOMPurify requires a `window` environment provided by linkedom.
function sanitizeHTMLString(dirtyDocumentString: string) {
  const parser = parseHTML(dirtyDocumentString)
  const purify = DOMPurify(parser.window)
  purify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "iframe") return
    const src = (node as Element).getAttribute?.("src") ?? ""
    if (!VIDEO_EMBED_SRC.test(src)) (node as Element).remove()
  })
  // How do DOMPurify changes the origin html structure,
  // You can refer its document https://github.com/cure53/DOMPurify?tab=readme-ov-file#can-i-configure-dompurify
  const sanitizedDocumentString = purify.sanitize(dirtyDocumentString, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "referrerpolicy", "loading"],
  })
  purify.removeHook("uponSanitizeElement")
  return sanitizedDocumentString
}

/**
 * Decodes the response body of a `fetch` request into a string, ensuring proper character set handling.
 * @throws Will return "Failed to decode response content." if the decoding process encounters any errors.
 */
async function decodeResponseBodyChars(res: Response) {
  // Read the response body as an ArrayBuffer
  const buffer = await res.arrayBuffer()
  // Step 1: Get charset from Content-Type header
  const contentType = res.headers.get("content-type")
  const httpCharset = contentType?.match(/charset=([\w-]+)/i)?.[1]
  // Step 2: Use charset from Content-Type header or fall back to chardet
  const detectedCharset = httpCharset || chardet.detect(Buffer.from(buffer)) || "utf-8"
  // Step 3: Decode the response body using the detected charset
  try {
    const decodedText = new TextDecoder(detectedCharset, { fatal: false }).decode(buffer)
    return decodedText
  } catch {
    return "Failed to decode response content."
  }
}

export async function readability(baseUrl: string) {
  const dirtyDocumentString = await fetch(baseUrl, {
    headers: {
      "User-Agent": userAgents,
      Accept: "text/html",
    },
  }).then(decodeResponseBodyChars)

  return readabilityFromHtml(new URL(baseUrl).origin, dirtyDocumentString)
}

/** Extract without making another network request; callers own URL and response validation. */
export function readabilityFromHtml(baseUrl: string, dirtyDocumentString: string) {
  const sanitizedDocumentString = sanitizeHTMLString(dirtyDocumentString)

  // FIXME: linkedom does not handle relative addresses in strings. Refer to
  // @see https://github.com/WebReflection/linkedom/issues/153
  // JSDOM handles it correctly, but JSDOM introduces canvas binding.
  const { document } = parseHTML(sanitizedDocumentString)

  document.querySelectorAll("a").forEach((a) => {
    a.href = replaceRelativeAddress(baseUrl, a.href)
  })
  ;(["img", "audio", "video"] as const).forEach((tag) => {
    document.querySelectorAll(tag).forEach((img) => {
      img.src = img.src && replaceRelativeAddress(baseUrl, img.src)
    })
  })

  const reader = new Readability(document, {
    debug: isDev,
    // keep classes to set the right code language
    // https://github.com/hugh-zhan9/Follow/issues/1058
    keepClasses: true,
    // Readability drops embeds outside its own host list, which does not
    // include Bilibili, so it removed the frame the sanitizer had just kept.
    // Widening it cannot let anything new back in: sanitizeHTMLString already
    // ran and only the hosts above survive it.
    allowedVideoRegex: ALLOWED_VIDEO_HOST,
  })
  return reader.parse()
}

const replaceRelativeAddress = (baseUrl: string, url: string) => {
  if (url.startsWith("http")) {
    return url
  }
  return new URL(url, baseUrl).href
}
