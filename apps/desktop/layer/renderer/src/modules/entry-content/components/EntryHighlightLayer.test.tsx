import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EntryHighlightLayer } from "./EntryHighlightLayer"

class FakeHighlight {
  ranges: Range[]
  constructor(...ranges: Range[]) {
    this.ranges = ranges
  }
}

describe("EntryHighlightLayer", () => {
  let container: HTMLDivElement
  let root: Root
  let registry: Map<string, FakeHighlight>

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    registry = new Map()
    vi.stubGlobal("Highlight", FakeHighlight)
    vi.stubGlobal("CSS", { highlights: registry })

    document.body.innerHTML = `<article><p>前面的话，被高亮的句子，后面的话。</p></article>`
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    document.body.innerHTML = ""
    vi.unstubAllGlobals()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  })

  it("registers a browser highlight for every quote it resolves in the article", async () => {
    await act(async () =>
      root.render(<EntryHighlightLayer highlights={[{ quote: "被高亮的句子" }]} />),
    )

    const painted = registry.get("suhui-annotation")
    expect(painted?.ranges).toHaveLength(1)
    expect(painted!.ranges[0]!.toString()).toBe("被高亮的句子")
  })

  it("clears the registry when the article has no resolvable quote left", async () => {
    await act(async () =>
      root.render(<EntryHighlightLayer highlights={[{ quote: "被高亮的句子" }]} />),
    )
    expect(registry.has("suhui-annotation")).toBe(true)

    await act(async () => root.render(<EntryHighlightLayer highlights={[{ quote: "已删除" }]} />))
    expect(registry.has("suhui-annotation")).toBe(false)
  })
})
