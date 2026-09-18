import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

type RemoteAssetResult = {
  content: Buffer | string
  contentType: string
}

const __dirname = fileURLToPath(new URL(".", import.meta.url))

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".tsx": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
}

// The home-screen shell needs these at the root: a manifest link resolves
// against the origin, and a worker may only claim the scope it is served from.
// They are an explicit allowlist rather than a directory listing so the server
// never starts handing out arbitrary files from the renderer bundle.
const REMOTE_PWA_ASSETS = new Set([
  "/remote-manifest.webmanifest",
  "/remote-sw.js",
  "/remote-apple-touch-icon.png",
  "/remote-icon-192.png",
  "/remote-icon-512.png",
])

export const isRemotePwaAssetPath = (pathname: string) => REMOTE_PWA_ASSETS.has(pathname)

const getRendererDistRoot = () => path.resolve(__dirname, "../renderer")

const rewriteDevHtml = (html: string) =>
  html.replaceAll(/(src|href)="\/(?!\/)/g, '$1="/__remote_dev__/')

const resolveContentType = (pathname: string) =>
  CONTENT_TYPES[path.extname(pathname)] || "application/octet-stream"

export const getRemoteClientHtml = async () => {
  const rendererUrl = process.env["ELECTRON_RENDERER_URL"]
  if (rendererUrl) {
    const response = await fetch(`${rendererUrl}/remote.html`)
    if (!response.ok) {
      throw new Error(`Failed to load remote.html from dev server: HTTP ${response.status}`)
    }

    return rewriteDevHtml(await response.text())
  }

  const filePath = path.join(getRendererDistRoot(), "remote.html")
  if (existsSync(filePath)) {
    return readFileSync(filePath, "utf8")
  }

  return null
}

export const getRemoteClientAsset = async (pathname: string): Promise<RemoteAssetResult | null> => {
  const rendererUrl = process.env["ELECTRON_RENDERER_URL"]
  if (rendererUrl && pathname.startsWith("/__remote_dev__/")) {
    const targetPath = pathname.replace("/__remote_dev__", "")
    const response = await fetch(`${rendererUrl}${targetPath}`)
    if (!response.ok) {
      return null
    }

    return {
      content: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") || resolveContentType(targetPath),
    }
  }

  if (pathname.startsWith("/assets/") || isRemotePwaAssetPath(pathname)) {
    const filePath = path.join(getRendererDistRoot(), pathname)
    if (!existsSync(filePath)) {
      return null
    }

    return {
      content: readFileSync(filePath),
      contentType: resolveContentType(pathname),
    }
  }

  return null
}
