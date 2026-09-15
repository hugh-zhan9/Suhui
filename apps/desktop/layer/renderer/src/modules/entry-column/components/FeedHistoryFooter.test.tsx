import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { FeedHistoryFooter } from "./FeedHistoryFooter"

const state = vi.hoisted(() => ({ scroll: null as HTMLDivElement | null, inView: true }))
vi.mock("@suhui/components/ui/scroll-area/hooks.js", () => ({
  useScrollViewElement: () => state.scroll,
}))
vi.mock("@suhui/components/ui/loading/index.jsx", () => ({
  LoadingCircle: () => <span>loading</span>,
}))
vi.mock("react-intersection-observer", () => ({
  useInView: () => ({ ref: vi.fn(), inView: state.inView }),
}))
let root: Root
let container: HTMLDivElement
const interacted = { current: false }
const history = {
  feedId: "f1",
  loading: false,
  status: "more" as const,
  error: null as string | null,
  loadMore: vi.fn(async () => {}),
}
const render = async () => {
  await act(async () => {
    root.render(<FeedHistoryFooter history={history} interacted={interacted} />)
  })
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  state.scroll = container
  state.inView = true
  interacted.current = false
  history.error = null
  history.loading = false
  history.loadMore.mockClear()
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top: 0,
    bottom: 100,
  } as DOMRect)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})
it("does not fetch on mount, but downward wheel at the end of a short list loads history", async () => {
  await render()
  expect(history.loadMore).not.toHaveBeenCalled()
  await act(async () => {
    container.dispatchEvent(new WheelEvent("wheel", { deltaY: 100 }))
  })
  expect(history.loadMore).toHaveBeenCalledTimes(1)
})
it("does not fetch when footer is outside the scroll viewport or while loading", async () => {
  await render()
  container.firstElementChild!.getBoundingClientRect = () =>
    ({ top: 1000, bottom: 1100 }) as DOMRect
  container.dispatchEvent(new WheelEvent("wheel", { deltaY: 100 }))
  expect(history.loadMore).not.toHaveBeenCalled()
  history.loading = true
  await render()
  container.dispatchEvent(new Event("scroll"))
  expect(history.loadMore).not.toHaveBeenCalled()
})
it("keeps the error visible and requests only on the retry button", async () => {
  history.error = "offline"
  interacted.current = true
  await render()
  container.dispatchEvent(new Event("scroll"))
  expect(history.loadMore).not.toHaveBeenCalled()
  expect(container.textContent).toContain("offline")
  await act(async () => {
    container.querySelector("button")!.click()
  })
  expect(history.loadMore).toHaveBeenCalledWith(true)
})
