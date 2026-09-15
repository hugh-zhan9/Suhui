import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EntryHeaderActionsContainer } from "./EntryHeaderActionsContainer"

const state = vi.hoisted(() => ({
  enabled: true,
  query: { isFetching: true, isSuccess: false, error: null as Error | null },
  progress: { status: "partial", completedBatches: 1, totalBatches: 3 },
  setOverride: vi.fn(),
}))
vi.mock("@suhui/components/ui/button/action-button.js", () => ({
  ActionButton: ({ children, onClick, id, active }: any) => (
    <button id={id} onClick={onClick} aria-pressed={active}>
      {children}
    </button>
  ),
}))
vi.mock("@suhui/shared/constants", () => ({ IN_ELECTRON: true }))
vi.mock("@suhui/store/collection/hooks", () => ({ useIsEntryStarred: () => false }))
vi.mock("@suhui/store/entry/hooks", () => ({ useEntry: () => ({ feedId: "feed" }) }))
vi.mock("@suhui/store/subscription/hooks", () => ({ useSubscriptionByFeedId: () => {} }))
vi.mock("@suhui/store/runtime", () => ({ runtimeClient: {} }))
vi.mock("@suhui/store/translation/hooks", () => ({
  useEntryTranslationProgress: () => state.progress,
}))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("~/atoms/ai-translation", () => ({
  useShowAITranslation: () => state.enabled,
  setCurrentTranslationOverride: state.setOverride,
}))
vi.mock("~/atoms/settings/general", () => ({ useActionLanguage: () => "zh-CN" }))
vi.mock("~/components/ui/button/CommandActionButton", () => ({ CommandActionButton: () => null }))
vi.mock("~/hooks/biz/export-as-pdf", () => ({ isPDFExportSupportedView: () => false }))
vi.mock("~/hooks/biz/useRouteParams", () => ({ useRouteParams: () => ({ view: 0 }) }))
vi.mock("~/modules/command/hooks/use-command", () => ({ useRunCommandFn: () => vi.fn() }))
vi.mock("../../../actions/header-actions", () => ({ EntryHeaderActions: () => null }))
vi.mock("../../../actions/more-actions", () => ({ MoreActions: () => null }))
vi.mock("../../../use-entry-translation-query", () => ({
  useEntryTranslationQuery: () => state.query,
}))
vi.mock("./context", () => ({ useEntryHeaderContext: () => ({ entryId: "article" }) }))

describe("translation header button", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    state.enabled = true
    state.query = { isFetching: true, isSuccess: false, error: null }
    container = document.createElement("div")
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    vi.clearAllMocks()
  })
  const render = async () => {
    // Remount the memoized container to supply the next mocked hook snapshot.
    await act(async () => root.render(null))
    await act(async () => root.render(<EntryHeaderActionsContainer isSmallWidth />))
    return container.querySelector('button[id="article/translation/quick"]') as HTMLButtonElement
  }

  it("shows text at narrow widths and waits for the current content query to finish", async () => {
    state.progress = { status: "complete", completedBatches: 0, totalBatches: 0 }
    state.query.isSuccess = true
    expect((await render()).textContent).toBe("entry.translation.translating")
    state.query.isFetching = false
    expect((await render()).textContent).toBe("entry.translation.complete")
  })

  it("shows failure, then an inactive translate button when switched off", async () => {
    state.query = { isFetching: false, isSuccess: false, error: new Error("provider failed") }
    const failed = await render()
    expect(failed.textContent).toBe("entry.translation.error")
    await act(async () => failed.click())
    expect(state.setOverride).toHaveBeenLastCalledWith("article", "force-off")
    state.enabled = false
    const disabled = await render()
    expect(disabled.textContent).toBe("entry.translation.label")
    expect(disabled.getAttribute("aria-pressed")).toBe("false")
    await act(async () => disabled.click())
    expect(state.setOverride).toHaveBeenLastCalledWith("article", "force-on")
  })
})
