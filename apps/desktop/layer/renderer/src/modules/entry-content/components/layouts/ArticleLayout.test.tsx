// @vitest-environment happy-dom

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

vi.mock("@suhui/shared/constants", () => ({ IN_ELECTRON: true }))

vi.mock("~/atoms/settings/ui", () => ({
  useUISettingKey: () => "",
}))

vi.mock("~/atoms/settings/general", () => ({
  useActionLanguage: () => "zh-CN",
  useGeneralSettingKey: () => "default",
}))

vi.mock("~/atoms/readability", () => ({
  useEntryIsInReadability: () => false,
}))

vi.mock("~/constants/ui", () => ({
  readableContentMaxWidthClassName: "max-w-test",
}))

vi.mock("~/lib/bilingual-html", () => ({
  resolveTranslationHtml: ({ sourceHtml }: any) => sourceHtml,
}))

vi.mock("~/lib/rss-content-normalize", () => ({
  normalizeRssContentForRender: (html: string) => html,
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

vi.mock("../EntryAnnotationsPanel", () => ({
  EntryAnnotationsPanel: () => null,
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

const toolbarSpy = vi.fn()
const toastErrorSpy = vi.fn()
const createHighlightSpy = vi.fn()
const translateTextSpy = vi.fn()

vi.mock("../selection/TextSelectionToolbar", () => ({
  TextSelectionToolbar: (props: any) => {
    toolbarSpy(props)
    return null
  },
}))

vi.mock("@suhui/store/runtime", () => ({
  runtimeClient: {
    annotations: {
      createHighlight: (...args: unknown[]) => createHighlightSpy(...args),
      relocate: () => Promise.resolve(),
    },
  },
}))

vi.mock("@suhui/store/translation/store", () => ({
  translationSyncService: {
    translateText: (...args: unknown[]) => translateTextSpy(...args),
  },
}))

vi.mock("../../hooks/useEntryAnnotations", () => ({
  useEntryAnnotations: () => ({ notes: [], highlights: [] }),
  refreshEntryAnnotations: () => Promise.resolve(),
}))

vi.mock("~/lib/toast", () => ({
  toast: { error: (...args: unknown[]) => toastErrorSpy(...args) },
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

describe("ArticleLayout highlight failure toast", () => {
  beforeEach(() => {
    toolbarSpy.mockClear()
    toastErrorSpy.mockClear()
    createHighlightSpy.mockReset()
  })

  it("puts the anchoring error into the copyable toast description", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      createHighlightSpy.mockRejectedValue(
        new Error(
          "Error invoking remote method 'localReading.createHighlight': Error: Highlight quote cannot be located",
        ),
      )
      renderToStaticMarkup(<ArticleLayout entryId="entry-1" />)

      const onHighlight = toolbarSpy.mock.calls.at(-1)?.[0]?.onHighlight
      expect(onHighlight).toBeTypeOf("function")

      await onHighlight({
        selectedText: "PRODUCT.md：记录产品目标",
        timestamp: 0,
        rect: { top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 },
      })

      expect(createHighlightSpy).toHaveBeenCalledOnce()
      expect(toastErrorSpy).toHaveBeenCalledOnce()
      const [title, options] = toastErrorSpy.mock.calls[0]!
      expect(title).toBe("entry_content.selection_toolbar.highlight_failed")
      expect(options?.description).toContain("Highlight quote cannot be located")
    } finally {
      consoleError.mockRestore()
    }
  })
})

describe("ArticleLayout selected-text translation", () => {
  beforeEach(() => {
    toolbarSpy.mockClear()
    translateTextSpy.mockReset().mockResolvedValue({ translatedText: "选区译文" })
  })

  it("sends only the selected text after the toolbar action is invoked", async () => {
    renderToStaticMarkup(<ArticleLayout entryId="entry-1" />)
    const onTranslate = toolbarSpy.mock.calls.at(-1)?.[0]?.onTranslate

    await expect(onTranslate({ selectedText: "Selected text" })).resolves.toBe("选区译文")
    expect(translateTextSpy).toHaveBeenCalledWith({
      text: "Selected text",
      language: "zh-CN",
    })
  })
})
