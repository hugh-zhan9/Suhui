/**
 * Prepares article markup for the remote reader.
 *
 * Reading mode keeps the source markup, including its class attributes, but
 * none of the source stylesheet. Two kinds of leftovers actively hurt:
 *
 * - `prose*`: the reader wraps content in Tailwind's `prose ... dark:prose-invert`,
 *   and a nested `.prose` re-declares the same typography variables, undoing the
 *   inversion and painting dark-mode body text in the light palette.
 * - Syntax-highlighting themes (`astro-code`, `shiki`, `hljs`, `highlight`),
 *   which pin code colours the host page is supposed to resolve and otherwise
 *   leave code blocks unreadable.
 *
 * Everything else is left alone, and elements that end up with no classes lose
 * the attribute entirely.
 *
 * Video embeds also get hardened here. The desktop renderer builds its iframes
 * through parse-html and can attach the sandbox there, but this client writes
 * the markup straight into the document, so the attributes have to be put on
 * before it is handed over.
 */
const COLLIDING_CLASS = /^(?:prose|astro-code|shiki|hljs|highlight)(?:-|$)/

const IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-popups allow-presentation"

export const sanitizeArticleHtml = (html: string): string => {
  if (!html || typeof DOMParser === "undefined") return html

  const parsed = new DOMParser().parseFromString(html, "text/html")

  for (const element of parsed.body.querySelectorAll("[class]")) {
    const kept = [...element.classList].filter((name) => !COLLIDING_CLASS.test(name))
    if (kept.length === element.classList.length) continue
    if (kept.length === 0) element.removeAttribute("class")
    else element.className = kept.join(" ")
  }

  for (const frame of parsed.body.querySelectorAll("iframe")) {
    const src = frame.getAttribute("src") ?? ""
    // Feeds still carry protocol-relative embeds, which resolve to http: here.
    if (src.startsWith("//")) frame.setAttribute("src", `https:${src}`)
    frame.setAttribute("sandbox", IFRAME_SANDBOX)
    frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin")
    frame.setAttribute("loading", "lazy")
    frame.setAttribute("allowfullscreen", "")
    // Fixed pixel sizes from the source overflow a phone; the stylesheet sizes
    // these from the aspect ratio instead.
    frame.removeAttribute("width")
    frame.removeAttribute("height")
  }

  return parsed.body.innerHTML
}
