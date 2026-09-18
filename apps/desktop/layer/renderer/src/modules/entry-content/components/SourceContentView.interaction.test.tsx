import type { ReactNode } from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  enableShowSourceContent,
  getShowSourceContent,
  resetShowSourceContent,
} from "~/atoms/source-content"

import { SOURCE_CONTENT_LOAD_TIMEOUT_MS } from "./source-content-state"
import { SourceContentPanel, SourceContentView } from "./SourceContentView"

vi.mock("@suhui/shared/constants", () => ({ IN_ELECTRON: true }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("~/components/ui/modal/stacked/hooks", () => ({
  useModalStack: () => ({ present: vi.fn() }),
}))
vi.mock("~/modules/command/hooks/use-command", () => ({ useRunCommandFn: () => () => vi.fn() }))
vi.mock("~/components/common/Motion", () => ({
  m: {
    div: ({ children, className }: { children: ReactNode; className: string }) => (
      <div className={className}>{children}</div>
    ),
  },
}))
vi.mock("@suhui/components/ui/button/index.js", () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}))
vi.mock("./entry-content/EntryContentLoading", () => ({
  EntryContentLoading: () => <span>Loading</span>,
}))

describe("original page return action", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    enableShowSourceContent()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    resetShowSourceContent()
    vi.useRealTimers()
  })

  it.each(["loading", "ready", "timeout", "failed", "late-success"])(
    "returns to the article from %s without changing the retained article",
    (status) => {
      act(() =>
        root.render(
          <>
            <p>Retained article</p>
            <SourceContentPanel src="https://example.com/article" entryId="entry" />
          </>,
        ),
      )
      const article = container.querySelector("p")!
      const webview = container.querySelector("webview")!
      act(() => {
        if (status === "timeout" || status === "late-success")
          vi.advanceTimersByTime(SOURCE_CONTENT_LOAD_TIMEOUT_MS)
        if (status === "ready" || status === "late-success")
          webview.dispatchEvent(new Event("dom-ready"))
        if (status === "failed")
          webview.dispatchEvent(
            Object.assign(new Event("did-fail-load"), { errorCode: -105, isMainFrame: true }),
          )
      })
      const back = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "entry_actions.return_to_reader",
      )
      expect(back).toBeDefined()
      act(() => back!.click())
      expect(getShowSourceContent()).toBe(false)
      expect(container.querySelector("webview")).toBeNull()
      expect(article.isConnected).toBe(true)
    },
  )

  it("leaves modal dismissal to the modal and does not show an unrelated reader action", () => {
    act(() => root.render(<SourceContentView src="https://example.com/article" />))
    expect(container.textContent).not.toContain("entry_actions.return_to_reader")
  })
})
