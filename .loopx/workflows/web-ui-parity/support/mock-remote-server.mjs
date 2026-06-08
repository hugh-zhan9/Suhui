import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"

const root = join(process.cwd(), "apps/desktop/dist/renderer")
const port = Number(process.env.PORT || 41871)
const now = Date.now()

const subscriptions = [
  {
    id: "feed/feed_alpha",
    type: "feed",
    feedId: "feed_alpha",
    title: "Local Design Notes",
    category: "Design",
    view: 0,
  },
  {
    id: "feed/feed_beta",
    type: "feed",
    feedId: "feed_beta",
    title: "Engineering Daily",
    category: "Engineering",
    view: 0,
  },
  {
    id: "feed/feed_gamma",
    type: "feed",
    feedId: "feed_gamma",
    title: "RSSHub Routes",
    category: "RSSHub",
    view: 0,
  },
]

const entries = [
  {
    id: "entry_1",
    feedId: "feed_alpha",
    title: "A calmer three-pane reader for remote access",
    author: "Suhui",
    url: "https://example.com/reader",
    read: false,
    publishedAt: now - 3600000,
    insertedAt: now - 3500000,
    content:
      "<p>The remote endpoint now opens as a focused RSS reader with subscriptions, entry list, and reading pane visible at once.</p><p>Management actions live in polished overlay surfaces instead of occupying the primary canvas.</p>",
  },
  {
    id: "entry_2",
    feedId: "feed_beta",
    title: "Runtime clients keep browser writes behind Electron main",
    author: "Desktop Host",
    url: "https://example.com/runtime",
    read: true,
    publishedAt: now - 7200000,
    insertedAt: now - 7100000,
    content:
      "<p>Remote browser actions continue through runtimeClient and HTTP application services.</p>",
  },
  {
    id: "entry_3",
    feedId: "feed_gamma",
    title: "External RSSHub configuration remains browser-safe",
    author: "RSSHub",
    url: "https://example.com/rsshub",
    read: false,
    publishedAt: now - 10800000,
    insertedAt: now - 10700000,
    content: "<p>RSSHub settings stay in the settings modal with precheck support.</p>",
  },
]

const unread = [
  { id: "feed_alpha", count: 1 },
  { id: "feed_beta", count: 0 },
  { id: "feed_gamma", count: 1 },
]

const contentType = (file) =>
  ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  })[extname(file)] || "application/octet-stream"

const json = (response, data) => {
  response.writeHead(200, { "content-type": "application/json; charset=utf-8" })
  response.end(JSON.stringify({ data }))
}

const serve = async (response, file) => {
  try {
    const data = await readFile(file)
    response.writeHead(200, { "content-type": contentType(file) })
    response.end(data)
  } catch {
    response.writeHead(404)
    response.end("not found")
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1")

  if (url.pathname === "/events") {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    })
    response.write("event: ready\ndata: {}\n\n")
    return
  }

  if (url.pathname === "/api/bootstrap") {
    json(response, {
      subscriptions,
      unread,
      settings: { appearance: "system", rsshubCustomUrl: "" },
      capabilities: { auth: "none", pdfExport: true },
    })
    return
  }

  if (url.pathname === "/api/subscriptions") {
    json(response, subscriptions)
    return
  }

  if (url.pathname === "/api/unread") {
    json(response, unread)
    return
  }

  if (url.pathname === "/api/settings") {
    json(response, { appearance: "system", rsshubCustomUrl: "" })
    return
  }

  if (url.pathname === "/api/entries") {
    const feedId = url.searchParams.get("feedId")
    const unreadOnly = ["1", "true"].includes(
      (url.searchParams.get("unreadOnly") || "").toLowerCase(),
    )
    let data = entries
    if (feedId) data = data.filter((entry) => entry.feedId === feedId)
    if (unreadOnly) data = data.filter((entry) => !entry.read)
    json(response, data)
    return
  }

  if (url.pathname.startsWith("/api/entries/") && url.pathname.endsWith("/pdf")) {
    response.writeHead(200, { "content-type": "application/pdf" })
    response.end(Buffer.from("%PDF-1.7 mock"))
    return
  }

  if (url.pathname.startsWith("/api/entries/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/entries/", ""))
    json(response, entries.find((entry) => entry.id === id) || null)
    return
  }

  if (url.pathname.startsWith("/api/")) {
    json(response, { ok: true })
    return
  }

  const pathname = url.pathname === "/" ? "/remote.html" : url.pathname
  const file = normalize(join(root, pathname))
  if (!file.startsWith(root)) {
    response.writeHead(403)
    response.end("forbidden")
    return
  }

  await serve(response, file)
})

server.listen(port, "127.0.0.1", () => {
  console.log(`mock remote server http://127.0.0.1:${port}`)
})
