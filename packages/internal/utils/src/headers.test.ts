import { APP_RENDERER_ORIGIN } from "@suhui/shared/constants"
import { describe, expect, it } from "vitest"

import { createBuildSafeHeaders } from "./headers"

const buildSafeHeaders = createBuildSafeHeaders("https://suhui.io", ["https://api.suhui.io"])

describe("createBuildSafeHeaders", () => {
  // Embedded players and hotlink-protected hosts reject the app's own origin,
  // so a request still carrying it has to leave with the target's instead.
  // This compared against upstream's `app://folo.is` until it was noticed, and
  // nothing in this app ever sends that, so every such request went out with
  // the renderer origin intact.
  it("replaces the renderer origin with the target's own", () => {
    const headers = buildSafeHeaders({
      url: "https://www.youtube.com/embed/abc123",
      headers: { Referer: APP_RENDERER_ORIGIN, Origin: APP_RENDERER_ORIGIN },
    })

    expect(headers.Referer).toBe("https://www.youtube.com")
    expect(headers.Origin).toBe("https://www.youtube.com")
  })

  it("keeps a referer that something else already set", () => {
    const headers = buildSafeHeaders({
      url: "https://www.youtube.com/embed/abc123",
      headers: { Referer: "https://example.com", Origin: "https://example.com" },
    })

    expect(headers.Referer).toBe("https://example.com")
  })

  it("still applies the per-host referer overrides", () => {
    const headers = buildSafeHeaders({
      url: "https://wx1.sinaimg.cn/large/abc.jpg",
      headers: { Referer: APP_RENDERER_ORIGIN },
    })

    expect(headers.Referer).toBe("https://weibo.com")
    expect(headers.Origin).toBe("https://weibo.com")
  })

  it("points requests to our own services at the web origin", () => {
    const headers = buildSafeHeaders({
      url: "https://api.suhui.io/entries",
      headers: { Referer: APP_RENDERER_ORIGIN },
    })

    expect(headers.Referer).toBe("https://suhui.io")
  })
})
