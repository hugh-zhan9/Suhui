import type { EntryModel } from "@suhui/store/entry/types"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ListItem } from "../../entry-column/templates/list-item-template"
import { EntryTitle } from "./EntryTitle"

const fixture = vi.hoisted(() => ({ title: "", translatedTitle: "", mode: "bilingual" }))
vi.mock("@suhui/store/entry/hooks", () => ({
  useEntry: (_id: string, selector: (entry: Partial<EntryModel>) => unknown) =>
    selector({ title: fixture.title, feedId: "feed-1" }),
}))
vi.mock("@suhui/store/collection/hooks", () => ({
  useIsEntryStarred: () => false,
  useCollectionEntry: vi.fn(),
}))
vi.mock("@suhui/store/feed/hooks", () => ({
  useFeedById: () => ({ id: "feed-1", title: "Feed" }),
}))
vi.mock("@suhui/store/inbox/hooks", () => ({ useInboxById: vi.fn() }))
vi.mock("@suhui/store/subscription/hooks", () => ({ useSubscriptionByFeedId: vi.fn() }))
vi.mock("@suhui/store/translation/hooks", () => ({
  useEntryTranslation: () => ({ title: fixture.translatedTitle }),
}))
vi.mock("@suhui/store/runtime", () => ({ runtimeClient: {} }))
vi.mock("~/atoms/ai-translation", () => ({ useShowAITranslation: () => true }))
vi.mock("~/atoms/readability", () => ({ useEntryIsInReadability: () => false }))
vi.mock("~/atoms/settings/general", () => ({
  getGeneralSettings: () => ({}),
  useActionLanguage: () => "zh-CN",
  useGeneralSettingKey: (key: string) =>
    key === "translationMode" ? fixture.mode : key === "actionLanguage" ? "zh-CN" : false,
}))
vi.mock("~/atoms/settings/ui", () => ({ useUISettingKey: () => false }))
vi.mock("~/atoms/source-content", () => ({ useShowSourceContent: () => false }))
vi.mock("~/atoms/player", () => ({ AudioPlayer: {}, useAudioPlayerAtomSelector: () => false }))
vi.mock("~/hooks/biz/export-as-pdf", () => ({ isPDFExportSupportedView: () => false }))
vi.mock("~/hooks/biz/useNavigateEntry", () => ({ useNavigateEntry: () => vi.fn() }))
vi.mock("~/hooks/biz/useRouteParams", () => ({
  useRouteParams: () => ({}),
  useRouteParamsSelector: () => false,
}))
vi.mock("~/hooks/biz/useAsRead", () => ({ useEntryIsRead: () => false }))
vi.mock("~/hooks/common/useFeedSafeUrl", () => ({
  useFeedSafeUrl: () => "https://example.com/article",
}))
vi.mock("~/lib/client", () => ({ ipcServices: {} }))
vi.mock("~/lib/toast", () => ({ toast: {} }))
vi.mock("~/modules/command/hooks/use-command", () => ({ useRunCommandFn: () => () => vi.fn() }))
vi.mock("~/modules/command/commands/id", () => ({ COMMAND_ID: { entry: {} } }))
vi.mock("~/modules/feed/feed-icon", () => ({ FeedIcon: () => null }))
vi.mock("~/modules/feed/feed-title", () => ({ FeedTitle: () => null }))
vi.mock("~/store/feed/hooks", () => ({ getPreferredTitle: () => "Feed" }))
vi.mock("~/components/ui/button/CommandActionButton", () => ({ CommandActionButton: () => null }))
vi.mock("@suhui/components/ui/button/action-button.js", () => ({ ActionButton: () => null }))
vi.mock("@suhui/components/hooks/useMobile.js", () => ({ useMobile: () => false }))
vi.mock("@suhui/components/ui/typography/index.js", () => ({
  EllipsisHorizontalTextWithTooltip: ({ children }: React.PropsWithChildren) => children,
}))
vi.mock("~/components/ui/datetime", () => ({ RelativeTime: () => null }))
vi.mock("~/components/ui/media/Media", () => ({ Media: () => null }))
vi.mock("~/components/ui/markdown/HTML", () => ({ HTML: () => null }))
vi.mock("../../entry-column/components/EntryStarToggleButton", () => ({
  EntryStarToggleButton: () => null,
}))
vi.mock("./entry-read-history", () => ({ EntryReadHistory: () => null }))

const renderTitle = (element: React.ReactNode) => {
  const container = document.createElement("div")
  container.innerHTML = renderToStaticMarkup(element)
  return container
}

describe.each([
  ["article detail", () => <EntryTitle entryId="entry-1" noRecentReader />],
  ["article list", () => <ListItem entryId="entry-1" simple />],
] as const)("%s title", (_name, element) => {
  beforeEach(() => {
    fixture.title = "万万没想到 6202 年了我还用 crontab &#43; HTTP Header 同步时钟"
    fixture.translatedTitle = ""
    fixture.mode = "bilingual"
  })

  it("decodes an already cached title without refetching it", () => {
    const container = renderTitle(element())
    expect(container.textContent).toContain(
      "万万没想到 6202 年了我还用 Crontab + HTTP Header 同步时钟",
    )
    expect(container.textContent).not.toContain("&#43;")
    expect(fixture.title).toContain("&#43;")
  })

  it.each(["&#43;", "&#x2b;", "&amp;#43;"])("decodes %s before title casing", (entity) => {
    fixture.title = `RSS ${entity} HTTP`
    expect(renderTitle(element()).textContent).toContain("RSS + HTTP")
  })

  it("keeps decoded markup as text", () => {
    fixture.title = "&lt;img src=x&gt;"
    const container = renderTitle(element())
    expect(container.textContent).toMatch(/<img/i)
    expect(container.querySelector("img")).toBeNull()
  })

  it("handles an empty title", () => {
    fixture.title = ""
    expect(() => renderTitle(element())).not.toThrow()
  })
})

describe("translated article title", () => {
  it.each(["bilingual", "translation-only"])("decodes the title in %s mode", (mode) => {
    fixture.title = "Original"
    fixture.translatedTitle = "译文 &amp;#43; HTTP"
    fixture.mode = mode
    const container = renderTitle(<EntryTitle entryId="entry-1" noRecentReader />)
    expect(container.textContent).toContain("译文 + HTTP")
    expect(container.textContent?.includes("Original")).toBe(mode === "bilingual")
  })
})
