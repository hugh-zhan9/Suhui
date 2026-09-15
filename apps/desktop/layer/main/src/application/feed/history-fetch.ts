import { lookup } from "node:dns/promises"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { isIP } from "node:net"

import { isPrivateNetworkHost } from "~/ipc/services/feed-discovery"

export const HISTORY_REQUEST_TIMEOUT_MS = 15_000
export const HISTORY_MAX_PAGE_BYTES = 2 * 1024 * 1024

export const isPublicHistoryAddress = (address: string) => {
  if (isPrivateNetworkHost(address)) return false
  if (isIP(address) === 4) {
    return !/^(?:192\.0\.|192\.88\.99\.|198\.(?:18|19|51\.100)\.|203\.0\.113\.)/.test(address)
  }
  // Only global unicast IPv6; exclude documentation, Teredo and 6to4 addresses.
  return (
    isIP(address) === 6 &&
    /^[23]/.test(address) &&
    !/^(?:2001:(?:0*db8|0{0,4}):|2002:)/i.test(address)
  )
}

export const validateHistoryUrl = (input: string, origin?: string) => {
  const url = new URL(input)
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    isPrivateNetworkHost(url.hostname) ||
    (origin && url.origin !== origin)
  ) {
    throw new Error("历史补全只支持同一公开站点的网页")
  }
  url.hash = ""
  return url
}

export type HistoryPage = { html: string; url: string }

/** Isolated public HTTP requests: no browser cookies, proxy credentials or automatic redirects. */
export async function fetchHistoryPage(input: string, origin: string): Promise<HistoryPage> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HISTORY_REQUEST_TIMEOUT_MS)
  const visited = new Set<string>()
  try {
    let target = input
    for (let hop = 0; hop <= 3; hop++) {
      const url = validateHistoryUrl(target, origin)
      if (visited.has(url.href)) throw new Error("历史页面发生循环跳转")
      visited.add(url.href)
      const hostname = url.hostname.replaceAll(/^\[|\]$/g, "")
      const addresses = await new Promise<Array<{ address: string; family: number }>>(
        (resolve, reject) => {
          const abort = () => reject(new Error("历史页面请求超时"))
          if (controller.signal.aborted) return abort()
          controller.signal.addEventListener("abort", abort, { once: true })
          void lookup(hostname, { all: true })
            .then(resolve, reject)
            .finally(() => {
              controller.signal.removeEventListener("abort", abort)
            })
        },
      )
      if (
        addresses.length === 0 ||
        addresses.some(({ address }) => !isPublicHistoryAddress(address))
      ) {
        throw new Error("历史页面地址不是公网地址")
      }
      if (controller.signal.aborted) throw new Error("历史页面请求超时")
      const response = await new Promise<{ html: string; location?: string }>((resolve, reject) => {
        const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
          url,
          {
            signal: controller.signal,
            agent: false,
            headers: {
              "User-Agent": "Suhui-RSS-Reader/1.0",
              Accept: "text/html",
              "Accept-Encoding": "identity",
            },
            // The socket uses exactly these validated addresses; no second DNS lookup.
            lookup: (_hostname, options, callback) => {
              if (options.all) callback(null, addresses)
              else callback(null, addresses[0]!.address, addresses[0]!.family)
            },
          },
          (res) => {
            const status = res.statusCode ?? 0
            if (status >= 300 && status < 400 && res.headers.location) {
              res.destroy()
              resolve({ html: "", location: res.headers.location })
              return
            }
            if (status < 200 || status >= 300) {
              res.destroy()
              reject(new Error(`历史页面请求失败：HTTP ${status}`))
              return
            }
            if (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") {
              res.destroy()
              reject(new Error("历史页面返回了不支持的压缩格式"))
              return
            }
            const chunks: Buffer[] = []
            let size = 0
            res.on("data", (chunk: Buffer) => {
              size += chunk.length
              if (size > HISTORY_MAX_PAGE_BYTES) {
                reject(new Error("历史页面超过 2 MiB 大小限制"))
                res.destroy()
              } else chunks.push(chunk)
            })
            res.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8") }))
            res.on("error", reject)
          },
        )
        request.on("error", reject)
        request.end()
      })
      if (!response.location) return { html: response.html, url: url.href }
      target = new URL(response.location, url).href
    }
    throw new Error("历史页面跳转次数超过限制")
  } finally {
    clearTimeout(timer)
  }
}
