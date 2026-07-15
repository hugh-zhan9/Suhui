import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8")

describe("renderer entry boundaries", () => {
  it("keeps distinct main and remote production inputs", () => {
    const rendererConfig = read("../../../../configs/vite.electron-render.config.ts")
    const mainHtml = read("../../index.html")
    const remoteHtml = read("../../remote.html")

    expect(rendererConfig).toMatch(
      /input:\s*\{[\s\S]*main:.*index\.html[\s\S]*remote:.*remote\.html/,
    )
    expect(mainHtml).toMatch(/src\/main\.tsx/)
    expect(remoteHtml).toMatch(/src\/remote\/main\.tsx/)
  })

  it("does not statically attach command implementations to root providers", () => {
    const rootProviders = read("./root-providers.tsx")

    expect(rootProviders).not.toMatch(/^import\s+\{?\s*FollowCommandManager/m)
  })

  it("does not statically attach the Shiki highlighter to ordinary HTML parsing", () => {
    const parseHtml = read("../lib/parse-html.ts")

    expect(parseHtml).not.toMatch(/^import .*code-highlighter/m)
  })

  it("substitutes test instrumentation with production owner hooks at build time", () => {
    const productionConfig = read("../../../../configs/vite.electron-render.config.ts")
    const testConfig = read("../../vitest.config.ts")
    const subscriptionList = read(
      "../modules/subscription-column/subscription-list/SubscriptionList.tsx",
    )
    const feedCategory = read("../modules/subscription-column/FeedCategory.tsx")
    const feedItem = read("../modules/subscription-column/FeedItem.tsx")
    const productionHooks = read("../modules/subscription-column/sidebar-owner-hooks.production.ts")

    expect(productionConfig).toMatch(
      /"virtual:sidebar-owner-hooks": resolve\([\s\S]*sidebar-owner-hooks\.production\.ts/,
    )
    expect(testConfig).toMatch(
      /"virtual:sidebar-owner-hooks": resolve\([\s\S]*sidebar-owner-profile\.instrumentation\.ts/,
    )
    for (const owner of [subscriptionList, feedCategory, feedItem]) {
      expect(owner).toMatch(/from "virtual:sidebar-owner-hooks"/)
      expect(owner).not.toMatch(/sidebar-owner-profile|import\.meta\.env\.MODE/)
    }
    expect(productionHooks).toMatch(/recordOwnerRender = \(_kind: "category" \| "row"\) => \{\}/)
    expect(productionHooks).toMatch(/projectOwnerModel = <Model>\(model: Model\): Model => model/)
    expect(productionHooks).not.toMatch(
      /OWNER_HOOKS_TEST_SENTINEL|observeOwnerRenders|setOwnerProjectionMode|rebuild-all/,
    )
  })
})
