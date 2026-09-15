/* @vitest-environment happy-dom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, createElement } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { usePrefetchEntryTranslation } from "./hooks"
import { translationActions } from "./store"

const { entry } = vi.hoisted(() => ({
  entry: {
    id: "observed",
    title: "Title",
    description: "Summary",
    content: "<p>Body</p>",
    readabilityContent: null,
    settings: {},
  },
}))
vi.mock("../entry/hooks", () => ({ useEntryList: () => [entry] }))
vi.mock("@suhui/database/services/translation", () => ({ TranslationService: {} }))

describe("reader and list query observers", () => {
  let root: Root
  let container: HTMLDivElement
  let client: QueryClient
  let previousElectron: unknown
  beforeEach(() => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    previousElectron = (window as any).electron
    translationActions.clearInSession()
    container = document.createElement("div")
    root = createRoot(container)
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    client.clear()
    ;(window as any).electron = previousElectron
  })

  it("keeps reader progress and completion when a mounted list observer fails", async () => {
    let readerQuery: ReturnType<typeof usePrefetchEntryTranslation>[number]
    let listQuery: ReturnType<typeof usePrefetchEntryTranslation>[number]
    let readerInput: any
    let listener!: (event: unknown, data: unknown) => void
    let finishReader!: (result: unknown) => void
    const pending = new Promise((resolve) => {
      finishReader = resolve
    })
    const invoke = vi.fn(async (_channel, input) => {
      if (!input.withContent) throw new Error("summary timed out")
      readerInput = input
      return pending
    })
    ;(window as any).electron = {
      ipcRenderer: {
        invoke,
        on: vi.fn((_channel, callback) => {
          listener = callback
          return vi.fn()
        }),
      },
    }
    const Reader = () => {
      readerQuery = usePrefetchEntryTranslation({
        entryIds: [entry.id],
        language: "zh-CN",
        enabled: true,
        withContent: true,
      })[0]
      return null
    }
    const List = () => {
      listQuery = usePrefetchEntryTranslation({
        entryIds: [entry.id],
        language: "zh-CN",
        enabled: true,
      })[0]
      return null
    }
    const render = (showList: boolean) =>
      act(async () =>
        root.render(
          createElement(
            QueryClientProvider,
            { client },
            createElement(Reader),
            showList ? createElement(List) : null,
          ),
        ),
      )
    await render(false)
    expect(invoke).toHaveBeenCalledOnce()
    const translation = {
      entryId: entry.id,
      language: "zh-CN",
      title: "Title",
      description: null,
      content: "partial body",
      readabilityContent: null,
    }
    await act(async () =>
      listener({}, { ...readerInput, completedBatches: 1, totalBatches: 2, translation }),
    )
    const progress = translationActions.getProgress(entry.id, "zh-CN")
    await render(true)
    await act(async () => {
      await vi.waitFor(() => expect(listQuery?.isError).toBe(true))
    })
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(readerQuery!.isFetching).toBe(true)
    expect(readerQuery!.error).toBeNull()
    expect(translationActions.getProgress(entry.id, "zh-CN")).toEqual(progress)
    expect(translationActions.getTranslation(entry.id, "zh-CN")?.content).toBe("partial body")
    await act(async () => {
      finishReader({ ...translation, content: "complete body" })
      await vi.waitFor(() => expect(readerQuery?.isSuccess).toBe(true))
    })
    expect(translationActions.getProgress(entry.id, "zh-CN")?.status).toBe("complete")
    expect(translationActions.getTranslation(entry.id, "zh-CN")?.content).toBe("complete body")
    expect(listQuery!.error?.message).toBe("summary timed out")
  })
})
