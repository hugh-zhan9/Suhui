import type { ComponentType } from "react"
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createLazyCodeHighlighter, type LazyCodeHighlighterProps } from "./lazy-code-highlighter"

describe("LazyCodeHighlighter", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  })

  it("commits readable semantic code before requesting enhancement", async () => {
    const load = vi.fn(() => {
      expect(container.querySelector("pre > code")?.textContent).toBe('const value = "plain"')
      return new Promise<ComponentType<LazyCodeHighlighterProps>>(() => undefined)
    })
    const Code = createLazyCodeHighlighter(load)

    await act(async () => root.render(<Code code={'const value = "plain"'} language="ts" />))

    const code = container.querySelector("pre > code")
    expect(code?.textContent).toBe('const value = "plain"')
    expect(code?.className).toBe("language-ts")
    expect(load).toHaveBeenCalledOnce()
  })

  it("enhances the committed fallback after the import resolves", async () => {
    let resolveImport: ((component: ComponentType<LazyCodeHighlighterProps>) => void) | undefined
    const load = vi.fn(
      () =>
        new Promise<ComponentType<LazyCodeHighlighterProps>>((resolve) => {
          resolveImport = resolve
        }),
    )
    const Code = createLazyCodeHighlighter(load)
    await act(async () => root.render(<Code code="enhance me" language="ts" />))
    expect(container.querySelector("pre > code")?.textContent).toBe("enhance me")

    await act(async () => {
      resolveImport?.(({ code }) => <div data-enhanced>{code}</div>)
    })

    expect(container.querySelector("[data-enhanced]")?.textContent).toBe("enhance me")
  })

  it("preserves every code character when the import fails", async () => {
    const load = vi.fn().mockRejectedValue(new Error("shiki chunk unavailable"))
    const Code = createLazyCodeHighlighter(load)
    const text = "<tag> & text\nsecond line"

    await act(async () => root.render(<Code code={text} language="html" />))
    await act(async () => Promise.resolve())

    const code = container.querySelector("pre > code")
    expect(load).toHaveBeenCalledOnce()
    expect(code?.textContent).toBe(text)
    expect(code?.className).toBe("language-html")
  })
})
