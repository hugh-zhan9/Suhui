import { describe, expect, it } from "vitest"

import config from "../../../electron.vite.config"

describe("electron-vite main config", () => {
  it("应将 Postgres 相关依赖标记为 external，避免 dev 模式解析 pg-native", () => {
    const external = config.main?.build?.rollupOptions?.external

    expect(external).toContain("pg")
    expect(external).toContain("pg-native")
  })

  it("应在 renderer 构建中去重 React，避免生产包出现多个 hook dispatcher", () => {
    const dedupe = config.renderer?.resolve?.dedupe

    expect(dedupe).toEqual(expect.arrayContaining(["react", "react-dom"]))
  })
})
