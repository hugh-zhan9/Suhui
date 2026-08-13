import { describe, expect, it } from "vitest"

import { createHighlightAnchor, relocateHighlightAnchor } from "./anchor"

describe("highlight anchors", () => {
  it("relocates a quote after content is inserted before it", () => {
    const anchor = createHighlightAnchor("Before the selected quote after.", {
      quote: "selected quote",
      startOffset: 11,
      endOffset: 25,
    })
    const relocated = relocateHighlightAnchor("New intro. Before the selected quote after.", anchor)
    expect(relocated.status).toBe("active")
    expect(relocated.startOffset).toBe(22)
  })

  it("uses context to disambiguate duplicate quotes", () => {
    const anchor = createHighlightAnchor("first target end. second target finish.", {
      quote: "target",
      startOffset: 25,
      endOffset: 31,
    })
    const relocated = relocateHighlightAnchor("prefix target end. changed second target finish.", {
      ...anchor,
      startOffset: null,
      endOffset: null,
    })
    expect(relocated.status).toBe("active")
    expect(relocated.startOffset).toBe(34)
  })

  it("uses supplied selection context to create an anchor for repeated text", () => {
    const anchor = createHighlightAnchor("first target end. second target finish.", {
      quote: "target",
      prefix: "second ",
      suffix: " finish.",
    })

    expect(anchor.startOffset).toBe(25)
    expect(anchor.status).toBe("active")
  })

  it("keeps the quote but marks an ambiguous or missing anchor orphaned", () => {
    const anchor = {
      quote: "same",
      prefix: "",
      suffix: "",
      startOffset: null,
      endOffset: null,
      status: "active" as const,
    }
    expect(relocateHighlightAnchor("same and same", anchor)).toMatchObject({
      quote: "same",
      status: "orphaned",
      startOffset: null,
    })
    expect(relocateHighlightAnchor("gone", anchor)).toMatchObject({
      quote: "same",
      status: "orphaned",
    })
  })
})
