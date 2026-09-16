import type { TranslationProgressState } from "@suhui/store/translation/store"
import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { copyToClipboard } from "~/lib/clipboard"

import messages from "../../../../../../../../../locales/app/zh-CN.json"
import { EntryTranslationStatus } from "./EntryTranslationStatus"

const state = vi.hoisted(() => ({
  progress: {} as Record<string, Partial<TranslationProgressState>>,
}))
vi.mock("@suhui/store/translation/hooks", () => ({
  useEntryTranslationProgress: (entryId: string) => state.progress[entryId],
}))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: keyof typeof messages, values?: Record<string, number>) =>
      Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
        messages[key],
      ),
  }),
}))
const retryBatch = vi.hoisted(() => vi.fn().mockResolvedValue({}))
vi.mock("@suhui/store/translation/store", () => ({ translationSyncService: { retryBatch } }))
vi.mock("~/lib/clipboard", () => ({ copyToClipboard: vi.fn(() => Promise.resolve()) }))

describe("article translation feedback", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    state.progress = {}
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  const render = (
    query?: React.ComponentProps<typeof EntryTranslationStatus>["query"],
    entryId = "article",
  ) =>
    act(async () =>
      root.render(<EntryTranslationStatus entryId={entryId} language="zh-CN" query={query} />),
    )

  it("immediately shows activity before a query or batch progress is available", async () => {
    await render()
    expect(container.querySelector('[role="status"]')?.textContent).toBe("正在翻译")
  })

  it("keeps partial and final-batch results translating until the content query resolves", async () => {
    for (const completedBatches of [0, 1, 3]) {
      state.progress.article = { status: "partial", completedBatches, totalBatches: 3 }
      await render({ isFetching: true, isSuccess: true, error: null })
      expect(container.textContent).toContain(`正在翻译 ${completedBatches}/3 批`)
      expect(container.textContent).not.toContain("翻译完成")
    }
    await render({ isFetching: false, isSuccess: true, error: null })
    expect(container.textContent).toBe("翻译完成")
  })

  it("does not mistake a completed metadata request or old cached result for current completion", async () => {
    state.progress.article = { status: "complete", completedBatches: 0, totalBatches: 0 }
    await render({ isFetching: true, isSuccess: true, error: null })
    expect(container.textContent).toBe("正在翻译")
    await render({ isFetching: false, isSuccess: true, error: null })
    expect(container.textContent).toBe("翻译完成")
  })

  it("hides completion after three seconds without restarting the timer on rerenders", async () => {
    vi.useFakeTimers()
    const complete = { isFetching: false, isSuccess: true, error: null }
    await render(complete)
    await act(async () => vi.advanceTimersByTime(2000))
    await render({ ...complete })
    await act(async () => vi.advanceTimersByTime(999))
    expect(container.textContent).toBe("翻译完成")
    await act(async () => vi.advanceTimersByTime(1))
    expect(container.childElementCount).toBe(0)
  })

  it("shows a fresh completion notice after fetching again or switching articles", async () => {
    vi.useFakeTimers()
    const complete = { isFetching: false, isSuccess: true, error: null }
    await render(complete)
    await act(async () => vi.advanceTimersByTime(3000))
    await render({ isFetching: true, isSuccess: true, error: null })
    await act(async () => vi.advanceTimersByTime(10000))
    expect(container.textContent).toBe("正在翻译")
    await render(complete)
    expect(container.textContent).toBe("翻译完成")
    await act(async () => vi.advanceTimersByTime(2000))
    await render(complete, "next-article")
    await act(async () => vi.advanceTimersByTime(1000))
    expect(container.textContent).toBe("翻译完成")
    await act(async () => vi.advanceTimersByTime(2000))
    expect(container.childElementCount).toBe(0)
  })

  it("cancels completion dismissal when a new request fails and keeps the error visible", async () => {
    vi.useFakeTimers()
    await render({ isFetching: false, isSuccess: true, error: null })
    await act(async () => vi.advanceTimersByTime(2000))
    await render({ isFetching: false, isSuccess: false, error: new Error("timeout") })
    await act(async () => vi.advanceTimersByTime(10000))
    expect(container.textContent).toContain("翻译失败")
    expect(container.textContent).toContain("timeout")
    expect(container.querySelector("button")?.textContent).toBe("复制错误")
  })

  it("keeps failure reasons visible and copyable after partial results", async () => {
    state.progress.article = { status: "partial", completedBatches: 1, totalBatches: 3 }
    await render({ isFetching: false, isSuccess: false, error: new Error("HTTP 429: rate limit") })
    expect(container.textContent).toContain("翻译失败")
    expect(container.querySelector("p")?.textContent).toBe("HTTP 429: rate limit")
    expect(container.firstElementChild?.classList.contains("select-text")).toBe(true)
    expect(container.firstElementChild?.classList.contains("no-drag-region")).toBe(true)
    expect(container.querySelector("button")?.classList.contains("no-drag-region")).toBe(true)
    await act(async () => container.querySelector("button")!.click())
    expect(copyToClipboard).toHaveBeenCalledExactlyOnceWith("HTTP 429: rate limit")
    expect(container.querySelector("button")?.textContent).toBe("已复制")
  })

  it("reports a clipboard failure without claiming success, and allows another copy attempt", async () => {
    vi.mocked(copyToClipboard).mockRejectedValueOnce(new Error("clipboard unavailable"))
    await render({ isFetching: false, isSuccess: false, error: new Error("translation timed out") })
    await act(async () => container.querySelector("button")!.click())
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "复制失败，请选中下方错误信息手动复制",
    )
    expect(container.querySelector("button")?.textContent).toBe("复制错误")
    await act(async () => container.querySelector("button")!.click())
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector("button")?.textContent).toBe("已复制")
  })

  it("clears old errors when fetching again or switching articles", async () => {
    const error = new Error("old error")
    await render({ isFetching: false, isSuccess: false, error })
    await render({ isFetching: true, isSuccess: false, error })
    expect(container.textContent).toBe("正在翻译")
    state.progress.article = { status: "partial", completedBatches: 2, totalBatches: 3 }
    await render(undefined, "next-article")
    expect(container.textContent).toBe("正在翻译")
    expect(container.querySelector("button")).toBeNull()
  })
  it("keeps partial failure visible and supports title retry instead of reporting complete", async () => {
    vi.useFakeTimers()
    state.progress.article = {
      status: "incomplete",
      completedBatches: 2,
      totalBatches: 2,
      batchState: {
        sessionId: "session",
        target: "content",
        completedBatches: 2,
        totalBatches: 2,
        failedBatches: [{ id: "title:1", target: "title", batchIndex: 1, error: "title timeout" }],
      },
    }
    await render({ isFetching: false, isSuccess: true, error: null })
    expect(container.querySelector('[role="status"]')?.textContent).toBe("翻译已结束，1 批失败")
    await act(async () => vi.advanceTimersByTime(5000))
    expect(container.textContent).toContain("title timeout")
    const button = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "重试",
    )!
    await act(async () => button.click())
    expect(retryBatch).toHaveBeenCalledWith("article", "zh-CN", "title:1")
    state.progress.article = {
      ...state.progress.article,
      status: "translating",
      retryingBatchId: "title:1",
    }
    await render({ isFetching: false, isSuccess: true, error: null })
    expect(
      [...container.querySelectorAll("button")].find((button) => button.textContent === "正在重试")
        ?.disabled,
    ).toBe(true)
  })
  it.each(["cache unavailable", "翻译会话已过期"])(
    "shows %s from a manual retry and provides a working restart action",
    async (error) => {
      vi.useFakeTimers()
      state.progress.article = {
        status: "error",
        completedBatches: 2,
        totalBatches: 2,
        error,
        batchState: {
          sessionId: "session",
          target: "content",
          completedBatches: 2,
          totalBatches: 2,
          failedBatches: [],
        },
      }
      const refetch = vi.fn().mockResolvedValue({})
      await render({ isFetching: false, isSuccess: true, error: null, refetch })
      await act(async () => vi.advanceTimersByTime(5000))
      expect(container.querySelector('[role="status"]')?.textContent).toBe("翻译失败")
      expect(container.textContent).toContain(error)
      const restart = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "重新翻译全文",
      )!
      await act(async () => restart.click())
      expect(refetch).toHaveBeenCalledOnce()
    },
  )
})
