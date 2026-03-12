import { describe, expect, it, vi } from "vitest"

import { logNetworkRequestError } from "./network-error-log"

describe("network-error-log", () => {
  it("记录网络失败的 URL 与错误码", () => {
    const error = vi.fn()

    logNetworkRequestError(
      {
        url: "https://feedly.com/favicon.ico",
        error: "net::ERR_CONNECTION_CLOSED",
        resourceType: "image",
        method: "GET",
      },
      { error },
    )

    expect(error).toHaveBeenCalledWith("[Network Error]", {
      error: "net::ERR_CONNECTION_CLOSED",
      method: "GET",
      resourceType: "image",
      url: "https://feedly.com/favicon.ico",
    })
  })
})
