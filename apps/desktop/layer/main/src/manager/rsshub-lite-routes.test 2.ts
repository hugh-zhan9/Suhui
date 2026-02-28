import { describe, expect, it } from "vitest"

import { extractLiteSupportedRoutes } from "./rsshub-lite-routes"

describe("rsshub lite routes", () => {
  it("应从 manifest 中提取 whitelist 路由并去重排序", () => {
    const routes = extractLiteSupportedRoutes({
      routes: [
        { route: "/github/issue/:owner/:repo", type: "whitelist" },
        { route: "/rsshub/routes/:lang?", type: "builtin" },
        { route: "github/trending/:since?", type: "whitelist" },
        { route: "/github/issue/:owner/:repo", type: "whitelist" },
      ],
    })

    expect(routes).toEqual(["/github/issue/:owner/:repo", "/github/trending/:since?"])
  })

  it("manifest 缺失时应返回空数组", () => {
    expect(extractLiteSupportedRoutes(null)).toEqual([])
    expect(extractLiteSupportedRoutes({})).toEqual([])
  })
})
