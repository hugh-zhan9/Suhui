import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"

import { PreserveReadingPosition } from "./PreserveReadingPosition"

describe("reading position across translation updates", () => {
  it.each([false, true])(
    "keeps the visible paragraph at the same height across a shadow root (native anchoring: %s)",
    (nativeAnchoring) => {
      const scroller = document.createElement("div")
      scroller.style.overflowY = "auto"
      scroller.scrollTop = 400
      Object.defineProperties(scroller, {
        scrollHeight: { value: 2000 },
        clientHeight: { value: 500 },
      })
      vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({
        top: 0,
        bottom: 500,
      } as DOMRect)
      document.body.append(scroller)
      const host = document.createElement("div")
      scroller.append(host)
      const mount = document.createElement("div")
      host.attachShadow({ mode: "open" }).append(mount)
      ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
      const root = createRoot(mount)
      act(() =>
        root.render(
          <PreserveReadingPosition element={null} identity="a" revision={0}>
            <article>
              <p>Reading</p>
            </article>
          </PreserveReadingPosition>,
        ),
      )
      const article = mount.querySelector("article")!
      const content = (revision: number, identity = "a") => (
        <PreserveReadingPosition element={article} identity={identity} revision={revision}>
          <article>
            {revision > 1 && <p key="translation">New translation</p>}
            <p key="reading">Reading</p>
          </article>
        </PreserveReadingPosition>
      )
      // Establish stable children before measuring the actual update.
      act(() => root.render(content(1)))
      const anchor = mount.querySelector("p")!
      vi.spyOn(anchor, "getBoundingClientRect").mockImplementation(() => {
        const inserted = article.children.length > 1
        const top = 420 + (inserted && !nativeAnchoring ? 120 : 0) - scroller.scrollTop
        return { top, bottom: top + 150, height: 150 } as DOMRect
      })
      act(() => root.render(content(2)))
      expect(scroller.scrollTop).toBe(nativeAnchoring ? 400 : 520)
      expect(anchor.getBoundingClientRect().top).toBe(20)
      expect(anchor.isConnected).toBe(true)
      act(() => root.unmount())
      scroller.remove()
    },
  )

  it("does not compensate when the article changes or the reader is at the top", () => {
    const article = document.createElement("article")
    const boundary = new PreserveReadingPosition({
      element: article,
      identity: "b",
      revision: 2,
      children: null,
    })
    expect(
      boundary.getSnapshotBeforeUpdate({
        element: article,
        identity: "a",
        revision: 1,
        children: null,
      }),
    ).toBeNull()
    expect(
      boundary.getSnapshotBeforeUpdate({
        element: article,
        identity: "b",
        revision: 1,
        children: null,
      }),
    ).toBeNull()
  })
})
