import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import { setAppSearchOpen } from "~/atoms/app"
import { searchActions } from "~/store/search"
import { SearchType } from "~/store/search/constants"

import { ArticleSearchButton } from "./ArticleSearchButton"

vi.mock("@suhui/shared/constants", () => ({ IN_ELECTRON: true }))
vi.mock("~/atoms/app", () => ({ setAppSearchOpen: vi.fn() }))
vi.mock("~/store/search", () => ({ searchActions: { setSearchType: vi.fn() } }))

it("opens article search without navigating the sidebar back home", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement("div")
  const root = createRoot(container)
  const backHome = vi.fn()
  try {
    await act(async () =>
      root.render(
        <div onClick={backHome}>
          <ArticleSearchButton />
        </div>,
      ),
    )
    const button = container.querySelector("button")!
    expect(button.textContent).toContain("搜索文章")
    await act(async () => button.click())
    expect(searchActions.setSearchType).toHaveBeenCalledWith(SearchType.Entry)
    expect(setAppSearchOpen).toHaveBeenCalledWith(true)
    expect(backHome).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount())
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  }
})
