import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./EntryAnnotationsPanel", () => ({
  EntryAnnotationsPanel: ({ entryId }: { entryId: string }) => (
    <div data-testid="annotations">{entryId}</div>
  ),
}))

import { DeferredEntryAnnotationsPanel } from "./DeferredEntryAnnotationsPanel"

describe("DeferredEntryAnnotationsPanel", () => {
  let container: HTMLDivElement
  let root: Root
  let intersectionCallback: IntersectionObserverCallback
  let idleCallback: IdleRequestCallback | undefined

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn(function (callback: IntersectionObserverCallback) {
        intersectionCallback = callback
        return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn(), takeRecords: vi.fn() }
      }),
    )
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((callback: IdleRequestCallback) => {
        idleCallback = callback
        return 1
      }),
    )
    vi.stubGlobal("cancelIdleCallback", vi.fn())
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  })

  it("waits until the panel is near-visible and the browser is idle", async () => {
    await act(async () => root.render(<DeferredEntryAnnotationsPanel entryId="entry-1" />))
    expect(container.querySelector('[data-testid="annotations"]')).toBeNull()

    await act(async () => {
      intersectionCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(requestIdleCallback).toHaveBeenCalled()
    expect(container.querySelector('[data-testid="annotations"]')).toBeNull()

    await act(async () => idleCallback?.({ didTimeout: false, timeRemaining: () => 10 }))
    expect(container.querySelector('[data-testid="annotations"]')?.textContent).toBe("entry-1")
  })
})
