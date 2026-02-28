import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"

import { dirname, join } from "pathe"

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
  const logFilePath = join(logDir, "rsshub-runtime.log")

  return (message) => {
    rotateLogs(logFilePath)
    appendFileSync(logFilePath, `[${new Date().toISOString()}] ${message}\n`)
  }
}

const unauthorized = (response) => {
  response.writeHead(403, { "content-type": "text/plain; charset=utf-8" })
  response.end("RSSHUB_TOKEN_REJECTED")
}

const notImplemented = (response, pathname) => {
  response.writeHead(501, { "content-type": "text/plain; charset=utf-8" })
  response.end(`RSSHUB_ROUTE_NOT_IMPLEMENTED: ${pathname}`)
}

const isAuthorized = (request, token) => {
  if (!token) return true
  return request.headers["x-rsshub-token"] === token
}

export const startRsshubRuntime = ({
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

  const server = createServer((request, response) => {
    const pathname = request.url ? new URL(request.url, "http://127.0.0.1").pathname : "/"

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

    log(`501 ${pathname}`)
    notImplemented(response, pathname)
  })

  server.listen(port, host, () => {
    const address = server.address()
    const runningPort = typeof address === "object" && address ? address.port : port
    log(`runtime started on ${host}:${runningPort}`)
  })

  const shutdown = () => {
    server.close()
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)

  return server
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startRsshubRuntime()
}
