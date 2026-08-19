import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const status = vi.hoisted(() => ({
  api: 0,
  network: 0,
}))

vi.mock("~/atoms/network", () => ({
  NetworkStatus: {
    ONLINE: 0,
    OFFLINE: 1,
  },
  useApiStatus: () => status.api,
  useNetworkStatus: () => status.network,
}))

vi.mock("@suhui/components/ui/tooltip/index.jsx", () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  TooltipContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
  TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

import { NetworkStatusIndicator } from "./NetworkStatusIndicator"

describe("NetworkStatusIndicator", () => {
  beforeEach(() => {
    status.api = 0
    status.network = 0
  })

  it("does not show a global API error for optional legacy API failures", () => {
    status.api = 1

    const html = renderToStaticMarkup(<NetworkStatusIndicator />)

    expect(html).toBe("")
  })

  it("still reports when the device itself is offline", () => {
    status.network = 1

    const html = renderToStaticMarkup(<NetworkStatusIndicator />)

    expect(html).toContain("Local Mode")
  })
})
