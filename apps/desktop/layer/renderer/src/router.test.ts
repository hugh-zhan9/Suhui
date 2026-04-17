import { describe, expect, it, vi } from "vitest"

vi.mock("./App", () => ({
  Component: () => null,
  StartupFallback: () => null,
}))

vi.mock("./components/common/ErrorElement", () => ({
  ErrorElement: () => null,
}))

vi.mock("./components/common/NotFound", () => ({
  NotFound: () => null,
}))

vi.mock("./generated-routes", () => ({
  routes: [],
}))

import { router } from "./router"

describe("router", () => {
  it("wires a provider-light hydrate fallback on the root route", () => {
    const rootRoute = router.routes[0] as {
      HydrateFallback?: unknown
      hydrateFallbackElement?: unknown
    }

    expect(rootRoute.HydrateFallback ?? rootRoute.hydrateFallbackElement).toBeDefined()
  })
})
