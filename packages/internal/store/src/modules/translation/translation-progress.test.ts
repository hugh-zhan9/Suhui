// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@suhui/database/services/translation", () => ({
  TranslationService: {
    insertTranslation: vi.fn(),
    purgeAllForMaintenance: vi.fn(),
  },
}))

import { TRANSLATION_PROGRESS_CHANNEL } from "@suhui/shared/translation"

import { translationActions, translationSyncService } from "./store"

describe("progressive translation IPC", () => {
  beforeEach(() => {
    translationActions.clearInSession()
  })

  it("accepts only the current request progress and always removes its listener", async () => {
    let listener: ((event: unknown, progress: unknown) => void) | undefined
    const dispose = vi.fn()
    const on = vi.fn((channel, callback) => {
      expect(channel).toBe(TRANSLATION_PROGRESS_CHANNEL)
      listener = callback
      return dispose
    })
    const invoke = vi.fn(async (_channel, input) => {
      listener?.(
        {},
        {
          requestId: "stale-request",
          entryId: input.entryId,
          language: input.language,
          completedBatches: 1,
          totalBatches: 2,
          translation: {
            entryId: input.entryId,
            language: input.language,
            title: null,
            description: null,
            content: "stale",
            readabilityContent: null,
          },
        },
      )
      listener?.(
        {},
        {
          requestId: input.requestId,
          entryId: input.entryId,
          language: input.language,
          completedBatches: 1,
          totalBatches: 2,
          translation: {
            entryId: input.entryId,
            language: input.language,
            title: null,
            description: null,
            content: "partial",
            readabilityContent: null,
          },
        },
      )
      listener?.(
        {},
        {
          requestId: input.requestId,
          entryId: input.entryId,
          language: input.language,
          completedBatches: 0,
          totalBatches: 2,
          translation: {
            entryId: input.entryId,
            language: input.language,
            title: null,
            description: null,
            content: "regressed",
            readabilityContent: null,
          },
        },
      )
      listener?.(
        {},
        {
          requestId: input.requestId,
          entryId: input.entryId,
          language: input.language,
          completedBatches: 2,
          totalBatches: 3,
          translation: {
            entryId: input.entryId,
            language: input.language,
            title: null,
            description: null,
            content: "changed-total",
            readabilityContent: null,
          },
        },
      )
      expect(translationActions.getTranslation(input.entryId, input.language)?.content).toBe(
        "partial",
      )
      return {
        entryId: input.entryId,
        language: input.language,
        title: null,
        description: null,
        content: "complete",
        readabilityContent: null,
      }
    })
    ;(window as any).electron = { ipcRenderer: { invoke, on } }

    await expect(
      translationSyncService.generateTranslation({
        entryId: "entry-1",
        language: "zh-CN",
        withContent: true,
        target: "content",
      }),
    ).resolves.toMatchObject({ content: "complete" })

    expect(invoke).toHaveBeenCalledWith(
      "translation.generate",
      expect.objectContaining({ requestId: expect.any(String) }),
    )
    expect(translationActions.getTranslation("entry-1", "zh-CN")?.content).toBe("complete")
    expect(translationActions.getProgress("entry-1", "zh-CN")).toMatchObject({
      status: "complete",
      completedBatches: 2,
      totalBatches: 2,
    })
    expect(dispose).toHaveBeenCalledOnce()
  })

  it("records a safe failure state and removes the listener", async () => {
    const dispose = vi.fn()
    ;(window as any).electron = {
      ipcRenderer: {
        on: vi.fn(() => dispose),
        invoke: vi.fn().mockRejectedValue(new Error("provider failed")),
      },
    }

    await expect(
      translationSyncService.generateTranslation({
        entryId: "entry-error",
        withContent: true,
        language: "ja",
        target: "content",
      }),
    ).rejects.toThrow("provider failed")

    expect(translationActions.getProgress("entry-error", "ja")).toMatchObject({
      status: "error",
      error: "provider failed",
    })
    expect(dispose).toHaveBeenCalledOnce()
  })

  it("does not let an older final result overwrite a newer failed request", async () => {
    let resolveFirst!: (value: unknown) => void
    let rejectSecond!: (reason: unknown) => void
    const firstResult = new Promise((resolve) => {
      resolveFirst = resolve
    })
    const secondResult = new Promise((_resolve, reject) => {
      rejectSecond = reject
    })
    let invocation = 0
    ;(window as any).electron = {
      ipcRenderer: {
        on: vi.fn(() => vi.fn()),
        invoke: vi.fn(() => (invocation++ === 0 ? firstResult : secondResult)),
      },
    }

    const first = translationSyncService.generateTranslation({
      entryId: "entry-race",
      withContent: true,
      language: "zh-CN",
      target: "content",
    })
    const second = translationSyncService.generateTranslation({
      entryId: "entry-race",
      withContent: true,
      language: "zh-CN",
      target: "readabilityContent",
    })
    const secondExpectation = expect(second).rejects.toThrow("new request failed")
    resolveFirst({
      entryId: "entry-race",
      withContent: true,
      language: "zh-CN",
      title: "stale title",
      description: null,
      content: "stale content",
      readabilityContent: null,
    })

    await first
    expect(translationActions.getTranslation("entry-race", "zh-CN")).toBeUndefined()
    rejectSecond(new Error("new request failed"))
    await secondExpectation
    expect(translationActions.getTranslation("entry-race", "zh-CN")).toBeUndefined()
    expect(translationActions.getProgress("entry-race", "zh-CN")?.status).toBe("error")
  })

  it.each([false, true])(
    "isolates a list result from an active reader (list fails: %s)",
    async (listFails) => {
      let listener!: (event: unknown, progress: unknown) => void
      let readerInput: any
      let finishReader!: (value: unknown) => void
      const readerResult = new Promise((resolve) => {
        finishReader = resolve
      })
      const translation = {
        entryId: "isolated",
        language: "zh-CN" as const,
        title: "Title",
        description: null,
        content: "partial body",
        readabilityContent: null,
      }
      const on = vi.fn((_channel, callback) => {
        listener = callback
        return vi.fn()
      })
      ;(window as any).electron = {
        ipcRenderer: {
          on,
          invoke: vi.fn(async (_channel, input) => {
            if (input.withContent) {
              readerInput = input
              return readerResult
            }
            if (listFails) throw new Error("summary timed out")
            return { ...translation, description: "Translated summary", content: "old cached body" }
          }),
        },
      }
      const reader = translationSyncService.generateTranslation({
        entryId: "isolated",
        language: "zh-CN",
        target: "content",
        withContent: true,
      })
      listener({}, { ...readerInput, completedBatches: 1, totalBatches: 2, translation })
      const before = translationActions.getProgress("isolated", "zh-CN")
      const list = translationSyncService.generateTranslation({
        entryId: "isolated",
        language: "zh-CN",
        target: "content",
      })
      if (listFails) await expect(list).rejects.toThrow("summary timed out")
      else await expect(list).resolves.toMatchObject({ description: "Translated summary" })
      expect(on).toHaveBeenCalledOnce()
      expect(translationActions.getProgress("isolated", "zh-CN")).toEqual(before)
      expect(translationActions.getTranslation("isolated", "zh-CN")?.content).toBe("partial body")
      finishReader({
        ...translation,
        content: "complete body",
        description: "stale cached summary",
      })
      await reader
      expect(translationActions.getProgress("isolated", "zh-CN")?.status).toBe("complete")
      expect(translationActions.getTranslation("isolated", "zh-CN")).toMatchObject({
        content: "complete body",
        description: listFails ? null : "Translated summary",
      })
    },
  )

  it("keeps a completed reader visible when a later list request fails", async () => {
    translationActions.upsertManyInSession([
      {
        entryId: "completed",
        language: "zh-CN",
        title: "Title",
        description: null,
        content: "complete body",
        readabilityContent: null,
      },
    ])
    translationActions.setProgress("completed", "zh-CN", {
      requestId: "reader",
      status: "complete",
      completedBatches: 2,
      totalBatches: 2,
    })
    ;(window as any).electron = {
      ipcRenderer: { invoke: vi.fn().mockRejectedValue(new Error("summary failed")), on: vi.fn() },
    }
    await expect(
      translationSyncService.generateTranslation({
        entryId: "completed",
        language: "zh-CN",
        target: "content",
      }),
    ).rejects.toThrow("summary failed")
    expect(translationActions.getProgress("completed", "zh-CN")?.status).toBe("complete")
    expect(translationActions.getTranslation("completed", "zh-CN")?.content).toBe("complete body")
  })

  it.each([true, false])(
    "ignores late responses after a source change (reader: %s)",
    async (withContent) => {
      let resolve!: (value: unknown) => void
      const pending = new Promise((done) => {
        resolve = done
      })
      ;(window as any).electron = {
        ipcRenderer: { on: vi.fn(() => vi.fn()), invoke: vi.fn(() => pending) },
      }
      translationActions.prepareInSession("changed", "zh-CN", "old")
      const job = translationSyncService.generateTranslation({
        entryId: "changed",
        language: "zh-CN",
        target: "content",
        withContent,
      })
      translationActions.prepareInSession("changed", "zh-CN", "new")
      resolve({
        entryId: "changed",
        language: "zh-CN",
        title: "stale",
        description: "stale",
        content: "stale",
        readabilityContent: null,
      })
      await job
      expect(translationActions.getTranslation("changed", "zh-CN")).toBeUndefined()
      expect(translationActions.getProgress("changed", "zh-CN", withContent)).toBeUndefined()
    },
  )
  it("keeps partial failure terminal, deduplicates retry clicks, and clears failures only on success", async () => {
    const translation = {
      entryId: "retry",
      language: "zh-CN" as const,
      title: null,
      description: null,
      content: "partial",
      readabilityContent: null,
    }
    const batchState = {
      sessionId: "session",
      target: "content" as const,
      completedBatches: 1,
      totalBatches: 2,
      failedBatches: [
        { id: "content:1", target: "content" as const, batchIndex: 1, error: "timeout" },
      ],
    }
    let release!: (result: unknown) => void
    const pending = new Promise((resolve) => {
      release = resolve
    })
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ ...translation, batchState })
      .mockReturnValueOnce(pending)
    ;(window as any).electron = { ipcRenderer: { invoke, on: vi.fn(() => vi.fn()) } }
    await translationSyncService.generateTranslation({
      entryId: "retry",
      language: "zh-CN",
      withContent: true,
      target: "content",
    })
    expect(translationActions.getProgress("retry", "zh-CN")).toMatchObject({
      status: "incomplete",
      completedBatches: 1,
      totalBatches: 2,
      batchState,
    })
    const first = translationSyncService.retryBatch("retry", "zh-CN", "content:1")
    const duplicate = translationSyncService.retryBatch("retry", "zh-CN", "content:1")
    expect(first).toBe(duplicate)
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke.mock.calls[1][1]).toMatchObject({
      retry: { sessionId: "session", batchId: "content:1" },
    })
    expect(translationActions.getTranslation("retry", "zh-CN")?.content).toBe("partial")
    expect(translationActions.getProgress("retry", "zh-CN")).toMatchObject({
      retryingBatchId: "content:1",
      completedBatches: 1,
    })
    release({ ...translation, content: "complete" })
    await first
    expect(translationActions.getProgress("retry", "zh-CN")).toMatchObject({
      status: "complete",
      completedBatches: 2,
    })
    expect(translationActions.getProgress("retry", "zh-CN")?.batchState).toBeUndefined()
    expect(translationActions.getTranslation("retry", "zh-CN")?.content).toBe("complete")
  })

  it("keeps retry errors actionable without discarding successful translation", async () => {
    const batchState = {
      sessionId: "session",
      target: "content" as const,
      completedBatches: 1,
      totalBatches: 2,
      failedBatches: [
        { id: "content:1", target: "content" as const, batchIndex: 1, error: "timeout" },
      ],
    }
    translationActions.setProgress("retry-error", "zh-CN", {
      requestId: "old",
      status: "incomplete",
      completedBatches: 1,
      totalBatches: 2,
      batchState,
    })
    ;(window as any).electron = {
      ipcRenderer: {
        invoke: vi.fn().mockRejectedValue(new Error("会话已过期")),
        on: vi.fn(() => vi.fn()),
      },
    }
    await expect(
      translationSyncService.retryBatch("retry-error", "zh-CN", "content:1"),
    ).rejects.toThrow("会话已过期")
    expect(translationActions.getProgress("retry-error", "zh-CN")).toMatchObject({
      status: "incomplete",
      batchState,
      error: "会话已过期",
    })
    expect(translationActions.getProgress("retry-error", "zh-CN")?.retryingBatchId).toBeUndefined()
  })
  it("records a cache failure after the final successful progress event as an error", async () => {
    const batchState = {
      sessionId: "session",
      target: "content" as const,
      completedBatches: 1,
      totalBatches: 2,
      failedBatches: [
        { id: "content:1", target: "content" as const, batchIndex: 1, error: "timeout" },
      ],
    }
    translationActions.setProgress("cache-error", "zh-CN", {
      requestId: "old",
      status: "incomplete",
      completedBatches: 1,
      totalBatches: 2,
      batchState,
    })
    let listener!: (event: unknown, progress: unknown) => void
    ;(window as any).electron = {
      ipcRenderer: {
        on: (_channel, callback) => {
          listener = callback
          return vi.fn()
        },
        invoke: async (_channel, input) => {
          listener(
            {},
            {
              ...input,
              completedBatches: 2,
              totalBatches: 2,
              translation: {
                entryId: input.entryId,
                language: input.language,
                title: null,
                description: null,
                content: "complete body",
                readabilityContent: null,
                batchState: { ...batchState, completedBatches: 2, failedBatches: [] },
              },
            },
          )
          throw new Error("cache unavailable")
        },
      },
    }
    await expect(
      translationSyncService.retryBatch("cache-error", "zh-CN", "content:1"),
    ).rejects.toThrow("cache unavailable")
    expect(translationActions.getProgress("cache-error", "zh-CN")).toMatchObject({
      status: "error",
      error: "cache unavailable",
      completedBatches: 2,
    })
    expect(translationActions.getTranslation("cache-error", "zh-CN")?.content).toBe("complete body")
  })
})
