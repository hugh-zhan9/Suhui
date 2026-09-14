import { act } from "react"
import { createRoot } from "react-dom/client"
import { MemoryRouter, useLocation } from "react-router"
import { expect, it, vi } from "vitest"

import { AnnotationLibraryLink } from "./AnnotationLibraryLink"

vi.mock("@suhui/shared/constants", () => ({ IN_ELECTRON: true }))

function CurrentPath() {
  return <output>{useLocation().pathname}</output>
}

it("opens the library without bubbling into the sidebar's back-home handler", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement("div")
  const root = createRoot(container)
  const backHome = vi.fn()
  try {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/timeline/articles/all"]}>
          <div onClick={backHome}>
            <AnnotationLibraryLink />
          </div>
          <CurrentPath />
        </MemoryRouter>,
      ),
    )
    const link = container.querySelector("a")!
    expect(link.textContent).toContain("笔记与高亮")
    await act(async () => link.click())
    expect(container.querySelector("output")?.textContent).toBe("/annotations")
    expect(link.getAttribute("aria-current")).toBe("page")
    expect(backHome).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount())
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  }
})
