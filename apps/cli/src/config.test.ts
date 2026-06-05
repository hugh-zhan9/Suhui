import { describe, expect, it } from "vitest"

import { defaultBaseUrl, resolveBaseUrl } from "./config.js"

describe("resolveBaseUrl", () => {
  it("uses explicit option before environment and default, trimming trailing slashes", () => {
    expect(
      resolveBaseUrl({
        explicitBaseUrl: "http://localhost:41595///",
        env: { SUHUI_CLI_BASE_URL: "http://10.0.0.2:41595" },
      }),
    ).toBe("http://localhost:41595")
  })

  it("uses SUHUI_CLI_BASE_URL before the default", () => {
    expect(
      resolveBaseUrl({
        env: { SUHUI_CLI_BASE_URL: "http://10.0.0.2:41595/" },
      }),
    ).toBe("http://10.0.0.2:41595")
  })

  it("defaults to local Suhui remote server", () => {
    expect(resolveBaseUrl({ env: {} })).toBe(defaultBaseUrl)
  })

  it("rejects invalid URLs", () => {
    expect(() => resolveBaseUrl({ explicitBaseUrl: "not a url", env: {} })).toThrow(
      /Invalid base URL/,
    )
  })
})
