import { describe, expect, it } from "vitest"

import { buildRsshubManifest } from "./rsshub-manifest"

describe("buildRsshubManifest", () => {
  it("应生成包含路由清单的 manifest", () => {
    const manifest = buildRsshubManifest({
      routes: [
        { route: "/github/release/:owner/:repo", type: "redirect" },
        { route: "/rsshub/routes/:lang?", type: "builtin" },
      ],
      runtimeType: "embedded-lite",
    })

    expect(manifest.runtimeType).toBe("embedded-lite")
    expect(manifest.routes.length).toBe(2)
    expect(manifest.routes[0]?.route).toBe("/github/release/:owner/:repo")
    expect(typeof manifest.generatedAt).toBe("string")
  })

  it("应支持 dual runtime 类型", () => {
    const manifest = buildRsshubManifest({
      routes: [{ route: "/github/release/:owner/:repo", type: "redirect" }],
      runtimeType: "embedded-dual",
    })

    expect(manifest.runtimeType).toBe("embedded-dual")
  })
})
