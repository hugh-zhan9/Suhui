const BUILT_IN_ROUTES = [
  "/rsshub/routes/:lang?",
  "/github/trending",
  "/weibo/user/:uid",
  "/zhihu/daily",
]

const escapeXml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")

const buildRoutesRss = (baseUrl) => {
  const now = new Date().toUTCString()
  const items = BUILT_IN_ROUTES.map((route) => {
    const link = `${baseUrl}${route.replace(":lang?", "en").replace(":uid", "2")}`
    return `<item><title>${escapeXml(route)}</title><link>${escapeXml(link)}</link><guid>${escapeXml(route)}</guid><pubDate>${now}</pubDate><description>Built-in route</description></item>`
  }).join("")

  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>FreeFolo Built-in RSSHub Routes</title><link>${escapeXml(baseUrl)}</link><description>Available routes in embedded runtime</description><lastBuildDate>${now}</lastBuildDate>${items}</channel></rss>`
}

export const handleKnownRoute = (pathname, baseUrl) => {
  if (pathname === "/rsshub/routes" || pathname.startsWith("/rsshub/routes/")) {
    return {
      statusCode: 200,
      contentType: "application/rss+xml; charset=utf-8",
      body: buildRoutesRss(baseUrl),
    }
  }

  return null
}
