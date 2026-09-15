import { DOMParser } from "linkedom/worker"

import { extractSiteArticles } from "~/ipc/services/site-scrape"

import { validateHistoryUrl } from "./history-fetch"

export const parseHistoryPage = (html: string, pageUrl: string, knownSignatures: string[]) => {
  const page = new URL(pageUrl)
  const document = new DOMParser().parseFromString(html, "text/html")
  const listing = extractSiteArticles(html, pageUrl, { knownSignatures })
  const next: string[] = []
  const archives: string[] = []
  for (const anchor of document.querySelectorAll("a[href], link[rel=next][href]")) {
    let target: URL
    try {
      target = validateHistoryUrl(new URL(anchor.getAttribute("href")!, page).href, page.origin)
    } catch {
      continue
    }
    if (target.href === page.href) continue
    const rel = (anchor.getAttribute("rel") ?? "").split(/\s+/)
    const text = (anchor.textContent ?? "").trim()
    if (
      rel.includes("next") ||
      /^(?:下一页|下页|更早文章|next(?: page)?|older(?: posts| entries)?)\s*[›»→]?$/i.test(text)
    ) {
      next.push(target.href)
    } else if (
      /\/(?:archives?|posts)(?:\/(?:\d{4}(?:\/\d{1,2})?|page\/\d+))?\/?$/i.test(target.pathname)
    ) {
      archives.push(target.href)
    }
  }
  return { ...listing, pages: [...new Set([...next, ...archives])].slice(0, 100) }
}
