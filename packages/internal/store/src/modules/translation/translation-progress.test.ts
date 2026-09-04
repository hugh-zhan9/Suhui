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
      language: "zh-CN",
      target: "content",
    })
    const second = translationSyncService.generateTranslation({
      entryId: "entry-race",
      language: "zh-CN",
      target: "readabilityContent",
    })
    const secondExpectation = expect(second).rejects.toThrow("new request failed")
    resolveFirst({
      entryId: "entry-race",
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
})
