import { afterEach, describe, expect, it } from "vitest"

import { buildPreviewDiagnostics } from "./preview-feed-diagnostics"

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe("buildPreviewDiagnostics", () => {
  it("captures proxy env, dns ip, and port with final url", async () => {
    process.env.HTTP_PROXY = "http://proxy.local:7890"
    process.env.HTTPS_PROXY = "https://secure-proxy.local:8443"
    process.env.ALL_PROXY = "socks5://all-proxy.local:1080"
    process.env.NO_PROXY = "localhost,127.0.0.1"

    const diagnostics = await buildPreviewDiagnostics({
      phase: "after",
      inputUrl: "https://blog.einverne.info/feed.xml",
      requestedUrl: "https://blog.einverne.info/feed.xml",
      finalUrl: "https://blog.einverne.info/feed.xml",
      redirectChain: [],
      remoteAddress: "93.184.216.34",
      remotePort: 443,
      lookup: async () => ({ address: "203.0.113.9" }),
    })

    expect(diagnostics).toEqual({
      phase: "after",
      inputUrl: "https://blog.einverne.info/feed.xml",
      requestedUrl: "https://blog.einverne.info/feed.xml",
      finalUrl: "https://blog.einverne.info/feed.xml",
      redirectChain: [],
      proxy: {
        http: "http://proxy.local:7890",
        https: "https://secure-proxy.local:8443",
        all: "socks5://all-proxy.local:1080",
        no: "localhost,127.0.0.1",
      },
      dns: {
        host: "blog.einverne.info",
        port: 443,
        address: "203.0.113.9",
        error: null,
      },
      connection: {
        remoteAddress: "93.184.216.34",
        remotePort: 443,
      },
    })
  })
})
