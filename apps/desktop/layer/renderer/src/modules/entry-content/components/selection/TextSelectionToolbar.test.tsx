// @vitest-environment happy-dom

import React, { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const present = vi.fn()

vi.mock("@suhui/components/ui/portal/index.js", () => ({
  RootPortal: ({ children }: any) => children,
}))
vi.mock("~/components/ui/modal/stacked/hooks", () => ({
  useModalStack: () => ({ present }),
}))
vi.mock("~/lib/clipboard", () => ({ copyToClipboard: vi.fn() }))
vi.mock("~/lib/toast", () => ({ toast: { error: vi.fn() } }))
vi.mock("./SharePosterModal", () => ({ SharePosterModal: () => null }))

import { toast } from "~/lib/toast"

import { TextSelectionToolbar } from "./TextSelectionToolbar"

const selection = {
  selectedText: "Selected text",
  timestamp: 0,
  startOffset: 0,
  endOffset: 13,
  prefix: "",
  suffix: "",
  rect: { top: 80, right: 120, bottom: 100, left: 20, width: 100, height: 20 },
}

describe("TextSelectionToolbar translation", () => {
  let container: HTMLDivElement
  let root: Root
  let events: EventTarget

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    events = new EventTarget()
    window.addEventListener = events.addEventListener.bind(events)
    window.removeEventListener = events.removeEventListener.bind(events)
    window.innerWidth = 800
    window.innerHeight = 600
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    document.body.innerHTML = ""
    vi.clearAllMocks()
  })

  const translateButton = () =>
    container.querySelector("button[aria-label*='translate']") as HTMLButtonElement

  it("shows the translation below the selection without opening a modal or sending duplicate requests", async () => {
    const onTranslate = vi.fn().mockResolvedValue("Translated selection")
    const onRequestClose = vi.fn()
    await act(async () =>
      root.render(
        <TextSelectionToolbar
          selection={selection}
          onRequestClose={onRequestClose}
          onTranslate={onTranslate}
        />,
      ),
    )
    expect(onTranslate).not.toHaveBeenCalled()
    await act(async () => translateButton().click())
    expect(onTranslate).toHaveBeenCalledExactlyOnceWith(selection)
    expect(present).not.toHaveBeenCalled()
    expect(onRequestClose).not.toHaveBeenCalled()
    const result = container.querySelector("[role='region']") as HTMLElement
    expect(result.textContent).toContain("Translated selection")
    expect(Number.parseFloat(result.style.top)).toBeGreaterThan(selection.rect.bottom)
    expect(result.getAttribute("aria-busy")).toBe("false")
    await act(async () => translateButton().click())
    expect(onTranslate).toHaveBeenCalledOnce()
    await act(async () => events.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })))
    expect(onRequestClose).toHaveBeenCalledOnce()
  })

  it("shows loading immediately and ignores an old result after selecting different text", async () => {
    let resolve!: (text: string) => void
    const onTranslate = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<string>((done) => {
          resolve = done
        }),
      )
      .mockResolvedValueOnce("New translation")
    const render = (selected: typeof selection | null) =>
      root.render(
        <TextSelectionToolbar
          selection={selected}
          onRequestClose={vi.fn()}
          onTranslate={onTranslate}
        />,
      )
    await act(async () => render(selection))
    await act(async () => translateButton().click())
    expect(container.querySelector("[role='region']")?.getAttribute("aria-busy")).toBe("true")
    await act(async () => render({ ...selection, selectedText: "Other text", timestamp: 1 }))
    expect(container.querySelector("[role='region']")).toBeNull()
    await act(async () => translateButton().click())
    await act(async () => resolve("Stale translation"))
    expect(container.textContent).toContain("New translation")
    expect(container.textContent).not.toContain("Stale translation")
    await act(async () => render(null))
    expect(container.textContent).toBe("")
  })

  it("ignores failures from dismissed requests and allows a new article to translate", async () => {
    let reject!: (error: Error) => void
    const onTranslate = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<string>((_done, fail) => {
          reject = fail
        }),
      )
      .mockResolvedValueOnce("New article translation")
    const render = (entryId: string) =>
      root.render(
        <TextSelectionToolbar
          entryId={entryId}
          selection={selection}
          onRequestClose={vi.fn()}
          onTranslate={onTranslate}
        />,
      )
    await act(async () => render("old"))
    await act(async () => translateButton().click())
    await act(async () => render("new"))
    await act(async () => reject(new Error("stale error")))
    expect(toast.error).not.toHaveBeenCalled()
    await act(async () => translateButton().click())
    expect(container.textContent).toContain("New article translation")
  })

  it("keeps the result readable when the selection is at the bottom of the viewport", async () => {
    const bottomSelection = { ...selection, rect: { ...selection.rect, top: 570, bottom: 590 } }
    await act(async () =>
      root.render(
        <TextSelectionToolbar
          selection={bottomSelection}
          onRequestClose={vi.fn()}
          onTranslate={vi.fn().mockResolvedValue("译文")}
        />,
      ),
    )
    await act(async () => translateButton().click())
    const result = container.querySelector("[role='region']") as HTMLElement
    expect(Number.parseFloat(result.style.maxHeight)).toBeGreaterThanOrEqual(96)
    expect(
      Number.parseFloat(result.style.top) + Number.parseFloat(result.style.maxHeight),
    ).toBeLessThan(bottomSelection.rect.top)
  })

  it("allows retry after a failed request and constrains results to a narrow viewport", async () => {
    window.innerWidth = 280
    const onTranslate = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider failed"))
      .mockResolvedValueOnce("译文".repeat(1000))
    await act(async () =>
      root.render(
        <TextSelectionToolbar
          selection={{ ...selection, rect: { ...selection.rect, left: 240 } }}
          onRequestClose={vi.fn()}
          onTranslate={onTranslate}
        />,
      ),
    )
    await act(async () => translateButton().click())
    expect(toast.error).toHaveBeenCalledOnce()
    expect(container.querySelector("[role='region']")).toBeNull()
    await act(async () => translateButton().click())
    const result = container.querySelector("[role='region']") as HTMLElement
    expect(
      Number.parseFloat(result.style.left) + Number.parseFloat(result.style.width),
    ).toBeLessThanOrEqual(268)
    expect(
      Number.parseFloat(result.style.top) + Number.parseFloat(result.style.maxHeight),
    ).toBeLessThanOrEqual(588)
  })
})
