import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs"
import { createServer } from "node:http"
// eslint-disable-next-line no-restricted-imports
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { cleanupCacheDir, getDirectorySize } from "./runtime-cache.js"
import { handleKnownRoute } from "./runtime-routes.js"

const MAX_LOG_BYTES = 10 * 1024 * 1024
const MAX_LOG_FILES = 5

const rotateLogs = (logFilePath) => {
  if (!existsSync(logFilePath)) return
  const { size } = statSync(logFilePath)
  if (size < MAX_LOG_BYTES) return

  for (let index = MAX_LOG_FILES - 1; index >= 1; index -= 1) {
    const source = `${logFilePath}.${index}`
    const target = `${logFilePath}.${index + 1}`
    if (existsSync(source)) {
      renameSync(source, target)
    }
  }
  renameSync(logFilePath, `${logFilePath}.1`)
}

const createLogger = (logDir) => {
  mkdirSync(logDir, { recursive: true })
  const logFilePath = join(logDir, "rsshub-official-runtime.log")

  return (message) => {
    rotateLogs(logFilePath)
    appendFileSync(logFilePath, `[${new Date().toISOString()}] ${message}\n`)
  }
}

const unauthorized = (response) => {
  response.writeHead(403, { "content-type": "text/plain; charset=utf-8" })
  response.end("RSSHUB_TOKEN_REJECTED")
}

const isAuthorized = (request, token) => {
  if (!token) return true
  return request.headers["x-rsshub-token"] === token
}

const escapeXml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")

const normalizeAuthor = (author) => {
  if (!author) return ""
  if (typeof author === "string") return author
  if (Array.isArray(author)) {
    return author
      .map((item) => (typeof item?.name === "string" ? item.name : ""))
      .filter(Boolean)
      .join(", ")
  }
  return ""
}

export const toRssXml = (data, requestUrl) => {
  const now = new Date().toUTCString()
  const items = Array.isArray(data?.item) ? data.item : []
  const channelTitle = data?.title || "RSSHub Official Feed"
  const channelLink = data?.link || requestUrl
  const channelDescription = data?.description || "RSSHub feed"
  const lastBuildDate = data?.lastBuildDate || now

  const itemXml = items
    .map((item) => {
      const title = escapeXml(item?.title || "Untitled")
      const link = escapeXml(item?.link || "")
      const guid = escapeXml(item?.guid || item?.id || item?.link || item?.title || "")
      const pubDate = new Date(item?.pubDate || item?.updated || now).toUTCString()
      const author = escapeXml(normalizeAuthor(item?.author))
      const description = escapeXml(
        item?.description || item?.content?.html || item?.content?.text || "",
      )
      const categoryXml = Array.isArray(item?.category)
        ? item.category.map((c) => `<category>${escapeXml(c)}</category>`).join("")
        : ""
      return `<item><title>${title}</title><link>${link}</link><guid>${guid}</guid><pubDate>${escapeXml(pubDate)}</pubDate>${author ? `<author>${author}</author>` : ""}<description>${description}</description>${categoryXml}</item>`
    })
    .join("")

  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(channelTitle)}</title><link>${escapeXml(channelLink)}</link><description>${escapeXml(channelDescription)}</description><lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>${itemXml}</channel></rss>`
}

let rsshubRequest = null

export const readRsshubErrorMessage = (payload) => {
  if (!payload || typeof payload !== "object") return ""
  const { error } = payload
  if (!error || typeof error !== "object") return ""
  if (typeof error.message === "string") return error.message.trim()
  return ""
}

const loadRsshubRequest = async () => {
  if (rsshubRequest) return rsshubRequest

  const runtimeRoot = dirname(fileURLToPath(import.meta.url))
  const pkgPath = join(
    runtimeRoot,
    "official-runtime",
    "node_modules",
    "rsshub",
    "dist-lib",
    "pkg.mjs",
  )

  if (!existsSync(pkgPath)) {
    throw new Error(`RSSHUB_OFFICIAL_RUNTIME_MISSING: ${pkgPath}`)
  }

  const module = await import(pathToFileURL(pkgPath).href)
  await module.init({ NODE_ENV: "production", IS_PACKAGE: true })
  rsshubRequest = module.request
  return rsshubRequest
}

export const startRsshubOfficialRuntime = ({
  port = Number.parseInt(process.env["PORT"] || "0", 10),
  token = process.env["RSSHUB_TOKEN"] || "",
  host = "127.0.0.1",
  logDir = process.env["RSSHUB_LOG_DIR"] || join(dirname(fileURLToPath(import.meta.url)), "logs"),
  cacheDir = process.env["RSSHUB_CACHE_DIR"] ||
    join(dirname(fileURLToPath(import.meta.url)), "cache"),
  maxCacheBytes = Number.parseInt(
    process.env["RSSHUB_CACHE_MAX_BYTES"] || `${500 * 1024 * 1024}`,
    10,
  ),
} = {}) => {
  const log = createLogger(logDir)
  mkdirSync(cacheDir, { recursive: true })
  const deletedFiles = cleanupCacheDir(cacheDir, maxCacheBytes)
  if (deletedFiles.length > 0) {
    log(`cache cleanup deleted ${deletedFiles.length} files`)
  }

  const server = createServer(async (request, response) => {
    const requestUrl = request.url
      ? new URL(request.url, "http://127.0.0.1")
      : new URL("http://127.0.0.1/")
    const { pathname } = requestUrl

    if (!isAuthorized(request, token)) {
      log(`403 ${pathname}`)
      unauthorized(response)
      return
    }

    if (pathname === "/healthz") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" })
      response.end(JSON.stringify({ ok: true }))
      return
    }

    if (pathname === "/status") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" })
      response.end(
        JSON.stringify({
          ok: true,
          cacheSizeBytes: getDirectorySize(cacheDir),
          cacheLimitBytes: maxCacheBytes,
          mode: "official",
        }),
      )
      return
    }

    const knownRouteResult = handleKnownRoute(pathname, `http://${host}:${port}`)
    if (knownRouteResult) {
      response.writeHead(knownRouteResult.statusCode, {
        "content-type": knownRouteResult.contentType,
        ...knownRouteResult.headers,
      })
      response.end(knownRouteResult.body)
      return
    }

    try {
      const requestFeed = await loadRsshubRequest()
      const pathWithSearch = `${pathname}${requestUrl.search || ""}`
      const data = await requestFeed(pathWithSearch)
      const errorMessage = readRsshubErrorMessage(data)
      if (errorMessage || (data && typeof data === "object" && "error" in data)) {
        if (!errorMessage) {
          response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
          response.end(`RSSHUB_ROUTE_NOT_IMPLEMENTED: ${pathname}`)
          return
        }
        response.writeHead(502, { "content-type": "text/plain; charset=utf-8" })
        response.end(`RSSHUB_OFFICIAL_RUNTIME_ERROR: ${errorMessage}`)
        return
      }
      const xml = toRssXml(data, `http://${host}:${port}${pathWithSearch}`)
      response.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" })
      response.end(xml)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log(`500 ${pathname} ${message}`)
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
      response.end(`RSSHUB_OFFICIAL_RUNTIME_ERROR: ${message}`)
    }
  })

  server.listen(port, host, () => {
    const address = server.address()
    const runningPort = typeof address === "object" && address ? address.port : port
    log(`official runtime started on ${host}:${runningPort}`)
  })

  const shutdown = () => {
    server.close()
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)

  return server
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startRsshubOfficialRuntime()
}
