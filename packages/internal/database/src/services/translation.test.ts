import { beforeEach, describe, expect, it, vi } from "vitest"

const { findManyTranslations, deleteTranslations } = vi.hoisted(() => ({
  findManyTranslations: vi.fn(),
  deleteTranslations: vi.fn(),
}))

vi.mock("../db", () => ({
  db: {
    query: {
      translationsTable: {
        findMany: findManyTranslations,
      },
    },
    delete: deleteTranslations,
  },
}))

import { TranslationService } from "./translation"

describe("TranslationService", () => {
  beforeEach(() => {
    findManyTranslations.mockReset()
    deleteTranslations.mockReset()
  })

  it("hydrates translations without deleting expired rows as a side effect", async () => {
    const rows = [
      {
        entryId: "entry-1",
        language: "zh-CN",
        title: "hello",
        description: null,
        content: null,
        readabilityContent: null,
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    ] as any[]
    findManyTranslations.mockResolvedValue(rows)

    await expect(TranslationService.getTranslationToHydrate()).resolves.toEqual(rows)
    expect(deleteTranslations).not.toHaveBeenCalled()
  })
})
