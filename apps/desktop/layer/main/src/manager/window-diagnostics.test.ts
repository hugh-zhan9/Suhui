import { describe, expect, it } from "vitest"

import { describeWindowState } from "./window-diagnostics"

describe("window-diagnostics", () => {
  it("输出窗口可见性与 bounds", () => {
    const state = describeWindowState({
      bounds: { x: 10, y: 20, width: 1280, height: 800 },
      destroyed: false,
      focused: true,
      minimized: false,
      visible: true,
    })

    expect(state).toEqual({
      bounds: { x: 10, y: 20, width: 1280, height: 800 },
      destroyed: false,
      focused: true,
      minimized: false,
      visible: true,
    })
  })
})
