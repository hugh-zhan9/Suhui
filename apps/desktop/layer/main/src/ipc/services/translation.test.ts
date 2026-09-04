import { describe, expect, it, vi } from "vitest"

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }))

vi.mock("electron-ipc-decorator", () => ({
  IpcMethod: () => () => undefined,
  IpcService: class {},
}))

vi.mock("~/application/translation/service", () => ({
  entryTranslationApplicationService: {
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    testConfig: vi.fn(),
    generate,
  },
}))

import { TRANSLATION_PROGRESS_CHANNEL } from "@suhui/shared/translation"

import { TranslationIpcService } from "./translation"

describe("TranslationIpcService", () => {
  it("sends progress only to the renderer that invoked generate", async () => {
    const send = vi.fn()
    const progress = {
      requestId: "request-1",
      entryId: "entry-1",
      language: "zh-CN",
      completedBatches: 1,
      totalBatches: 2,
      translation: {
        entryId: "entry-1",
        language: "zh-CN",
        title: null,
        description: null,
        content: "partial",
        readabilityContent: null,
      },
    }
    generate.mockImplementationOnce(async (_input, onProgress) => {
      onProgress(progress)
      return progress.translation
    })

    const result = await new TranslationIpcService().generate(
      { sender: { send, isDestroyed: () => false } } as any,
      {
        requestId: "request-1",
        entryId: "entry-1",
        language: "zh-CN",
        target: "content",
        withContent: true,
      },
    )

    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith(TRANSLATION_PROGRESS_CHANNEL, progress)
    expect(result).toEqual(progress.translation)
  })

  it("keeps the final translation valid when the invoking renderer has closed", async () => {
    const send = vi.fn()
    const translation = {
      entryId: "entry-closed",
      language: "zh-CN",
      title: null,
      description: null,
      content: "complete",
      readabilityContent: null,
    }
    generate.mockImplementationOnce(async (_input, onProgress) => {
      onProgress({
        requestId: "request-closed",
        entryId: "entry-closed",
        language: "zh-CN",
        completedBatches: 1,
        totalBatches: 1,
        translation,
      })
      return translation
    })

    await expect(
      new TranslationIpcService().generate({ sender: { send, isDestroyed: () => true } } as any, {
        requestId: "request-closed",
        entryId: "entry-closed",
        language: "zh-CN",
        target: "content",
        withContent: true,
      }),
    ).resolves.toEqual(translation)
    expect(send).not.toHaveBeenCalled()
  })
})
