import { describe, expect, it } from "vitest"

import { buildLiteRouteIndex, flattenOfficialNamespaces } from "./runtime-route-index.js"

describe("rsshub route index", () => {
  it("lite 路由应补齐 path 参数键", () => {
    const result = buildLiteRouteIndex(["/weibo/user/:uid", "/github/release/:owner/:repo"])
    expect(result[0]?.parameters).toEqual({ uid: "" })
    expect(result[1]?.parameters).toEqual({ owner: "", repo: "" })
  })

  it("official namespaces 应展平为完整路由并保留参数", () => {
    const result = flattenOfficialNamespaces({
      github: {
        routes: {
          "/release/:owner/:repo": {
            name: "Release",
            url: "github.com",
            example: "/github/release/vercel/next.js",
            parameters: { owner: "仓库 owner", repo: "仓库名" },
            categories: ["programming"],
            maintainers: ["foo"],
          },
        },
      },
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.path).toBe("/github/release/:owner/:repo")
    expect(result[0]?.parameters).toEqual({ owner: "仓库 owner", repo: "仓库名" })
    expect(result[0]?.categories).toEqual(["programming"])
  })
})
