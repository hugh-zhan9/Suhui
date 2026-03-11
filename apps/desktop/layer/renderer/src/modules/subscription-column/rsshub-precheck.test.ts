import { describe, expect, it } from "vitest"

import { ensureRsshubRuntimeReady } from "./rsshub-precheck"

describe("rsshub precheck", () => {
  it("未配置外部 RSSHub 时应抛结构化错误", async () => {
    await expect(
      ensureRsshubRuntimeReady({
        getCustomUrl: async () => "",
      }),
    ).rejects.toThrow(/RSSHUB_EXTERNAL_UNCONFIGURED/)
  })

  it("配置外部 RSSHub 时应通过", async () => {
    await expect(
      ensureRsshubRuntimeReady({
        getCustomUrl: async () => "https://rsshub.example.com",
      }),
    ).resolves.toBeUndefined()
  })
})
