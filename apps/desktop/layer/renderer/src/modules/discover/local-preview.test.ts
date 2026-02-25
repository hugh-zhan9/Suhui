import { shouldUseElectronLocalPreview } from "@follow/store/feed/local-preview"
import { describe, expect, it } from "vitest"

describe("shouldUseElectronLocalPreview", () => {
  it("Electron 且存在 url 时应走本地预览", () => {
    const win = { electron: { ipcRenderer: {} } }
    expect(shouldUseElectronLocalPreview(win, "https://example.com/rss.xml")).toBe(true)
  })

  it("无 url 时不走本地预览", () => {
    const win = { electron: { ipcRenderer: {} } }
    expect(shouldUseElectronLocalPreview(win, "")).toBe(false)
  })

  it("非 Electron 环境不走本地预览", () => {
    expect(shouldUseElectronLocalPreview({}, "https://example.com/rss.xml")).toBe(false)
  })
})
