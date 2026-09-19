/**
 * Strips styling hooks that extracted articles carry over from their source.
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
 */
const COLLIDING_CLASS = /^(?:prose|astro-code|shiki|hljs|highlight)(?:-|$)/

export const sanitizeArticleHtml = (html: string): string => {
  if (!html || typeof DOMParser === "undefined") return html

  const parsed = new DOMParser().parseFromString(html, "text/html")

  for (const element of parsed.body.querySelectorAll("[class]")) {
    const kept = [...element.classList].filter((name) => !COLLIDING_CLASS.test(name))
    if (kept.length === element.classList.length) continue
    if (kept.length === 0) element.removeAttribute("class")
    else element.className = kept.join(" ")
  }

  return parsed.body.innerHTML
}
