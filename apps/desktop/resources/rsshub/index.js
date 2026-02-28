import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs"
import { createServer } from "node:http"
// eslint-disable-next-line no-restricted-imports
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { hasValidToken } from "./runtime-auth.js"
import { cleanupCacheDir, getDirectorySize } from "./runtime-cache.js"
import { buildConsoleHomeHtml } from "./runtime-console.js"
import { resolveRuntimeDir } from "./runtime-paths.js"
import { buildLiteRouteIndex } from "./runtime-route-index.js"
import { BUILT_IN_ROUTES, handleKnownRoute } from "./runtime-routes.js"

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

const notWhitelisted = (response, pathname) => {
  response.writeHead(501, { "content-type": "text/plain; charset=utf-8" })
  response.end(`RSSHUB_ROUTE_NOT_WHITELISTED: ${pathname}`)
}

const BUILT_IN_ROUTE_INDEX = buildLiteRouteIndex(BUILT_IN_ROUTES)

export const startRsshubRuntime = ({
  port = Number.parseInt(process.env["PORT"] || "0", 10),
  token = process.env["RSSHUB_TOKEN"] || "",
  host = "127.0.0.1",
  logDir,
  cacheDir,
  maxCacheBytes = Number.parseInt(
    process.env["RSSHUB_CACHE_MAX_BYTES"] || `${500 * 1024 * 1024}`,
    10,
  ),
} = {}) => {
  const resolvedLogDir = resolveRuntimeDir({
    envValue: logDir || process.env["RSSHUB_LOG_DIR"],
    fallbackName: "logs",
    moduleUrl: import.meta.url,
  })
  const resolvedCacheDir = resolveRuntimeDir({
    envValue: cacheDir || process.env["RSSHUB_CACHE_DIR"],
    fallbackName: "cache",
    moduleUrl: import.meta.url,
  })

  const log = createLogger(resolvedLogDir)
  mkdirSync(resolvedCacheDir, { recursive: true })
  const deletedFiles = cleanupCacheDir(resolvedCacheDir, maxCacheBytes)
  if (deletedFiles.length > 0) {
    log(`cache cleanup deleted ${deletedFiles.length} files`)
  }

  const server = createServer((request, response) => {
    const pathname = request.url ? new URL(request.url, "http://127.0.0.1").pathname : "/"

    if (!hasValidToken({ requestUrl: request.url || "", headers: request.headers, token })) {
      log(`403 ${pathname}`)
      unauthorized(response)
      return
    }

    if (pathname === "/healthz") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" })
      response.end(JSON.stringify({ ok: true }))
      return
    }

    if (pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      response.end(
        buildConsoleHomeHtml({
          baseUrl: `http://${host}:${port}`,
          token,
          mode: "lite",
        }),
      )
      return
    }

    if (pathname === "/status") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" })
      response.end(
        JSON.stringify({
          ok: true,
          cacheSizeBytes: getDirectorySize(resolvedCacheDir),
          cacheLimitBytes: maxCacheBytes,
        }),
      )
      return
    }

    if (pathname === "/routes-index") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" })
      response.end(
        JSON.stringify({
          mode: "lite",
          total: BUILT_IN_ROUTE_INDEX.length,
          items: BUILT_IN_ROUTE_INDEX,
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
    notWhitelisted(response, pathname)
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
