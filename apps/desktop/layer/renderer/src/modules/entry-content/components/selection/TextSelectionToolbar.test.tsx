// @vitest-environment happy-dom

import React, { act } from "react"
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

import { TextSelectionToolbar } from "./TextSelectionToolbar"

describe("TextSelectionToolbar translation", () => {
  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    ;(window as any).removeEventListener = vi.fn()
  })

  afterEach(() => {
    document.body.innerHTML = ""
    vi.clearAllMocks()
  })

  it("calls translation only after the explicit button click and presents the result", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    const onTranslate = vi.fn().mockResolvedValue("Translated selection")
    const selection = {
      selectedText: "Selected text",
      timestamp: 0,
      startOffset: 0,
      endOffset: 13,
      prefix: "",
      suffix: "",
      rect: { top: 80, right: 120, bottom: 100, left: 20, width: 100, height: 20 },
    }

    await act(async () => {
      root.render(
        <TextSelectionToolbar
          selection={selection}
          onRequestClose={vi.fn()}
          onTranslate={onTranslate}
        />,
      )
    })
    expect(onTranslate).not.toHaveBeenCalled()

    const button = container.querySelector("button[aria-label*='translate']") as HTMLButtonElement
    await act(async () => button.click())

    expect(onTranslate).toHaveBeenCalledOnce()
    expect(onTranslate).toHaveBeenCalledWith(selection)
    expect(present).toHaveBeenCalledWith(
      expect.objectContaining({ id: "selection-translation", title: expect.any(String) }),
    )
    const modalContent = present.mock.calls[0]![0].content()
    expect(modalContent.props.children).toBe("Translated selection")

    await act(async () => root.unmount())
  })
})
