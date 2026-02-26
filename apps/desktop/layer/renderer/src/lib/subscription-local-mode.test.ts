import { describe, expect, it } from "vitest"

import { shouldUseLocalSubscriptionMutation } from "@follow/store/subscription/store"

describe("subscription local mode", () => {
  it("Electron 环境应使用本地订阅更新", () => {
    expect(shouldUseLocalSubscriptionMutation({ electron: { ipcRenderer: {} } })).toBe(true)
  })

  it("非 Electron 环境默认可走远端", () => {
    expect(shouldUseLocalSubscriptionMutation({})).toBe(false)
  })
})
