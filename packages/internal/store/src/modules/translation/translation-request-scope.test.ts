import { beforeEach, describe, expect, it, vi } from "vitest"

import { getTranslationSourceRevision, usePrefetchEntryTranslation } from "./hooks"
import { translationActions, translationSyncService } from "./store"

const { entry, useQueries } = vi.hoisted(() => ({
  entry: {
    id: "scope",
    title: "Title",
    description: "Summary",
    content: "",
    readabilityContent: null,
    settings: {},
  },
  useQueries: vi.fn((options) => options.queries),
}))
vi.mock("@tanstack/react-query", () => ({
  useQueries,
  useQueryClient: () => ({ setQueryData: vi.fn() }),
}))
vi.mock("../entry/hooks", () => ({ useEntryList: () => [entry] }))
vi.mock("@suhui/database/services/translation", () => ({ TranslationService: {} }))

describe("translation request scopes", () => {
  beforeEach(() => {
    translationActions.clearInSession()
    vi.restoreAllMocks()
    translationActions.prepareInSession(
      "scope",
      "zh-CN",
      getTranslationSourceRevision(entry as any),
    )
    translationActions.upsertManyInSession([
      {
        entryId: "scope",
        language: "zh-CN",
        title: "translated title",
        description: "translated summary",
        content: "partial body",
        readabilityContent: "readability body",
      },
    ])
  })

  it("keeps an empty reader body in reader scope and preserves list translations", async () => {
    const generate = vi
      .spyOn(translationSyncService, "generateTranslation")
      .mockResolvedValue({} as any)
    const [query] = usePrefetchEntryTranslation({
      entryIds: ["scope"],
      language: "zh-CN",
      enabled: true,
      withContent: true,
    }) as any
    expect(query.queryKey[3]).toBe(true)
    await query.queryFn()
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ withContent: true }))
    expect(translationActions.getTranslation("scope", "zh-CN")).toMatchObject({
      content: null,
      description: "translated summary",
      readabilityContent: "readability body",
    })
  })

  it("clears only the summary when the list starts fetching", async () => {
    const generate = vi
      .spyOn(translationSyncService, "generateTranslation")
      .mockResolvedValue({} as any)
    const [query] = usePrefetchEntryTranslation({
      entryIds: ["scope"],
      language: "zh-CN",
      enabled: true,
    }) as any
    await query.queryFn()
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ withContent: false }))
    expect(translationActions.getTranslation("scope", "zh-CN")).toMatchObject({
      title: "translated title",
      content: "partial body",
      description: null,
    })
  })

  it("invalidates both scopes when the source changes", async () => {
    vi.spyOn(translationSyncService, "generateTranslation").mockResolvedValue({} as any)
    translationActions.prepareInSession("scope", "zh-CN", "old-revision")
    translationActions.upsertManyInSession([
      {
        entryId: "scope",
        language: "zh-CN",
        title: "stale",
        description: "stale",
        content: "stale",
        readabilityContent: "stale",
      },
    ])
    const progress = {
      requestId: "stale",
      status: "partial" as const,
      completedBatches: 1,
      totalBatches: 2,
    }
    translationActions.setProgress("scope", "zh-CN", progress)
    translationActions.setProgress("scope", "zh-CN", progress, false)
    const [query] = usePrefetchEntryTranslation({
      entryIds: ["scope"],
      language: "zh-CN",
      enabled: true,
      withContent: true,
    }) as any
    await query.queryFn()
    expect(translationActions.getTranslation("scope", "zh-CN")).toBeUndefined()
    expect(translationActions.getProgress("scope", "zh-CN")).toBeUndefined()
    expect(translationActions.getProgress("scope", "zh-CN", false)).toBeUndefined()
  })
  it("only the explicit retranslation action requests force", async () => {
    const generate = vi
      .spyOn(translationSyncService, "generateTranslation")
      .mockResolvedValue({} as any)
    const [query] = usePrefetchEntryTranslation({
      entryIds: ["scope"],
      language: "zh-CN",
      enabled: true,
      withContent: true,
    }) as any
    await query.queryFn()
    expect(generate.mock.calls[0]![0].force).toBeUndefined()
    await query.retranslate()
    expect(generate.mock.calls[1]![0]).toMatchObject({
      withContent: true,
      force: true,
      target: "content",
    })
  })
})
