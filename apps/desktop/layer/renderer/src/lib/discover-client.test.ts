import { describe, expect, it } from "vitest"

import { DISCOVER_API_BASE_URL, discoverClient, getDiscoverApiBaseURL } from "~/lib/api-client"

describe("discover api client", () => {
  it("应将 Discover/Trending 指向旧版 folo API", () => {
    expect(DISCOVER_API_BASE_URL).toBe("https://api.folo.is")
    expect(getDiscoverApiBaseURL()).toBe("https://api.folo.is")
  })

  it("应以公开模式请求 Discover API，不携带凭证", () => {
    expect(discoverClient.getConfig().credentials).toBe("omit")
  })
})
