import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const generatedRoutes = readFileSync(resolve(process.cwd(), "src/generated-routes.ts"), "utf8")

const initialRouteModules = [
  "./pages/(main)/layout",
  "./pages/(main)/(layer)/timeline/[timelineId]/layout",
  "./pages/(main)/(layer)/timeline/[timelineId]/[feedId]/layout",
  "./pages/(main)/(layer)/timeline/[timelineId]/[feedId]/index",
]

describe("generated initial routes", () => {
  it("eagerly imports every mandatory Desktop timeline boundary", () => {
    for (const routeModule of initialRouteModules) {
      expect(generatedRoutes).toContain(`from "${routeModule}.sync"`)
      expect(generatedRoutes).not.toContain(`import("${routeModule}")`)
      expect(generatedRoutes).not.toContain(`import("${routeModule}.sync")`)
    }
  })

  it("keeps settings, subviews, and entry detail lazy", () => {
    expect(generatedRoutes).toContain('import("./pages/settings/layout")')
    expect(generatedRoutes).toContain(
      'import("./pages/(main)/(layer)/timeline/[timelineId]/[feedId]/[entryId]/index")',
    )
    expect(generatedRoutes).toContain('import("./pages/(main)/(layer)/(subview)/layout")')
  })
})
