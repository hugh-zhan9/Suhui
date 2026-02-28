import { defaultGeneralSettings } from "@follow/shared/settings/defaults"
import { describe, expect, it } from "vitest"

describe("mark read defaults", () => {
  it("默认应为单项内容进入视图时", () => {
    expect(defaultGeneralSettings.scrollMarkUnread).toBe(false)
    expect(defaultGeneralSettings.hoverMarkUnread).toBe(false)
    expect(defaultGeneralSettings.renderMarkUnread).toBe(true)
  })
})
