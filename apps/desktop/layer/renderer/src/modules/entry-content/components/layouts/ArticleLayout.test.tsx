import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const entryTitleSpy = vi.fn()

vi.mock("../EntryTitle", () => ({
  EntryTitle: (props: any) => {
    entryTitleSpy(props)
    return <div data-entry-title="mock" />
  },
}))

vi.mock("@suhui/store/entry/hooks", () => ({
  useEntry: () => ({ feedId: "feed-1", inboxId: null }),
}))

vi.mock("@suhui/store/feed/hooks", () => ({
  useFeedById: () => ({ id: "feed-1" }),
}))

vi.mock("@suhui/store/inbox/hooks", () => ({
  useIsInbox: () => false,
}))

vi.mock("~/atoms/settings/ui", () => ({
  useUISettingKey: () => "",
}))

vi.mock("../../hooks", () => ({
  useEntryContent: () => ({ content: "<p>ok</p>" }),
  useEntryMediaInfo: () => null,
}))

vi.mock("~/components/common/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: any) => children,
}))

vi.mock("~/components/common/ShadowDOM", () => ({
  ShadowDOM: ({ children }: any) => children,
}))

vi.mock("~/components/common/MemoedDangerousHTMLStyle", () => ({
  MemoedDangerousHTMLStyle: ({ children }: any) => <>{children}</>,
}))

vi.mock("~/providers/wrapped-element-provider", () => ({
  WrappedElementProvider: ({ children }: any) => children,
}))

vi.mock("../entry-content/ReadabilityNotice", () => ({
  ReadabilityNotice: () => null,
}))

vi.mock("../EntryAttachments", () => ({
  EntryAttachments: () => null,
}))

vi.mock("~/modules/renderer/html", () => ({
  EntryContentHTMLRenderer: ({ children }: any) => <div>{children}</div>,
}))

vi.mock("~/modules/renderer/markdown", () => ({
  EntryContentMarkdownRenderer: ({ children }: any) => <div>{children}</div>,
}))

vi.mock("~/hooks/biz/useRenderStyle", () => ({
  useRenderStyle: () => ({}),
}))

vi.mock("~/components/ui/modal/inspire/InPeekModal", () => ({
  useInPeekModal: () => false,
}))

import { ArticleLayout } from "./ArticleLayout"

describe("ArticleLayout original action wiring", () => {
  beforeEach(() => {
    entryTitleSpy.mockClear()
  })

  it("is the only path that opts EntryTitle into the visible original-action button", () => {
    renderToStaticMarkup(<ArticleLayout entryId="entry-1" />)

    expect(entryTitleSpy).toHaveBeenCalled()
    expect(entryTitleSpy.mock.calls[0]?.[0]).toMatchObject({
      entryId: "entry-1",
      showOriginalAction: true,
    })
  })
})
