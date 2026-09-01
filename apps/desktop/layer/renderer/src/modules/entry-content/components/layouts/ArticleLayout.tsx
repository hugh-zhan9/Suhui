import { MemoedDangerousHTMLStyle } from "@suhui/components/common/MemoedDangerousHTMLStyle.js"
import { FeedViewType } from "@suhui/constants"
import { isOnboardingEntry } from "@suhui/store/constants/onboarding"
import { useEntry } from "@suhui/store/entry/hooks"
import { useFeedById } from "@suhui/store/feed/hooks"
import { useIsInbox } from "@suhui/store/inbox/hooks"
import { runtimeClient } from "@suhui/store/runtime"
import { cn } from "@suhui/utils"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useEntryIsInReadability } from "~/atoms/readability"
import { useGeneralSettingKey } from "~/atoms/settings/general"
import { useUISettingKey } from "~/atoms/settings/ui"
import { ErrorBoundary } from "~/components/common/ErrorBoundary"
import { ShadowDOM } from "~/components/common/ShadowDOM"
import type { TocRef } from "~/components/ui/markdown/components/Toc"
import { useInPeekModal } from "~/components/ui/modal/inspire/InPeekModal"
import { readableContentMaxWidthClassName } from "~/constants/ui"
import { useRenderStyle } from "~/hooks/biz/useRenderStyle"
import { resolveTranslationHtml } from "~/lib/bilingual-html"
import { normalizeRssContentForRender } from "~/lib/rss-content-normalize"
import type { TextSelectionEvent } from "~/lib/simple-text-selection"
import { toast } from "~/lib/toast"
import { EntryContentHTMLRenderer } from "~/modules/renderer/html"
import { EntryContentMarkdownRenderer } from "~/modules/renderer/markdown"
import { WrappedElementProvider } from "~/providers/wrapped-element-provider"

import { useEntryContent, useEntryMediaInfo } from "../../hooks"
import { refreshEntryAnnotations, useEntryAnnotations } from "../../hooks/useEntryAnnotations"
import { DeferredEntryAnnotationsPanel } from "../DeferredEntryAnnotationsPanel"
import { ContainerToc } from "../entry-content/accessories/ContainerToc"
import { EntryRenderError } from "../entry-content/EntryRenderError"
import { ReadabilityNotice } from "../entry-content/ReadabilityNotice"
import { EntryAttachments } from "../EntryAttachments"
import { EntryHighlightLayer } from "../EntryHighlightLayer"
import { EntryTitle } from "../EntryTitle"
import { TextSelectionToolbar } from "../selection/TextSelectionToolbar"
import type { EntryLayoutProps } from "./types"

export const ArticleLayout: React.FC<EntryLayoutProps> = ({
  entryId,
  compact = false,
  noMedia = false,
  translation,
}) => {
  const entry = useEntry(entryId, (state) => ({
    feedId: state.feedId,
    inboxId: state.inboxHandle,
  }))
  const feed = useFeedById(entry?.feedId)
  const isInbox = useIsInbox(entry?.inboxId)

  const { t } = useTranslation()
  const { content } = useEntryContent(entryId)
  const isInReadability = useEntryIsInReadability(entryId)
  const customCSS = useUISettingKey("customCSS")
  const [selection, setSelection] = useState<TextSelectionEvent | null>(null)
  const { highlights } = useEntryAnnotations(entryId)
  const source = isInReadability ? "readability" : "rss"

  useEffect(() => {
    void runtimeClient.annotations
      .relocate(entryId)
      .catch(() => {})
      .then(() => refreshEntryAnnotations(entryId))
      .catch(() => {})
  }, [entryId])

  const paintedHighlights = useMemo(
    () => highlights.filter((item) => item.status === "active" && item.source === source),
    [highlights, source],
  )

  if (!entry) return null

  return (
    <div className={cn(readableContentMaxWidthClassName, "mx-auto mt-1 px-4")}>
      <EntryTitle
        entryId={entryId}
        compact={compact}
        containerClassName="mt-12"
        showOriginalAction
      />

      <WrappedElementProvider boundingDetection>
        <div className="mx-auto mb-32 mt-6 max-w-full cursor-auto text-[0.94rem]">
          <ErrorBoundary fallback={EntryRenderError}>
            <ReadabilityNotice entryId={entryId} />
            <ShadowDOM
              injectHostStyles={!isInbox}
              textSelectionEnabled
              onTextSelect={setSelection}
              onSelectionClear={() => setSelection(null)}
            >
              {!!customCSS && <MemoedDangerousHTMLStyle>{customCSS}</MemoedDangerousHTMLStyle>}

              <Renderer
                entryId={entryId}
                view={FeedViewType.Articles}
                feedId={feed?.id || ""}
                noMedia={noMedia}
                content={content}
                translation={translation}
              />
              <EntryHighlightLayer highlights={paintedHighlights} />
            </ShadowDOM>
            <TextSelectionToolbar
              entryId={entryId}
              selection={selection}
              onRequestClose={() => setSelection(null)}
              onHighlight={async (selected) => {
                try {
                  await runtimeClient.annotations.createHighlight({
                    entryId,
                    source,
                    quote: selected.selectedText,
                    startOffset: selected.startOffset,
                    endOffset: selected.endOffset,
                    prefix: selected.prefix,
                    suffix: selected.suffix,
                  })
                  await refreshEntryAnnotations(entryId)
                } catch (error) {
                  console.error("Failed to create highlight:", error)
                  toast.error(t("entry_content.selection_toolbar.highlight_failed"))
                }
              }}
            />
          </ErrorBoundary>
        </div>
      </WrappedElementProvider>

      <DeferredEntryAnnotationsPanel entryId={entryId} key={entryId} />

      <EntryAttachments entryId={entryId} />
    </div>
  )
}

const Renderer: React.FC<{
  entryId: string
  view: FeedViewType
  feedId: string
  noMedia?: boolean
  content?: Nullable<string>
  translation?: {
    content?: string
    title?: string
  }
}> = ({ entryId, view, feedId, noMedia = false, content = "", translation }) => {
  const mediaInfo = useEntryMediaInfo(entryId)
  const isMarkdownEntry = useMemo(() => {
    return isOnboardingEntry(entryId)
  }, [entryId])
  const readerRenderInlineStyle = useUISettingKey("readerRenderInlineStyle")
  const stableRenderStyle = useRenderStyle()
  const isInPeekModal = useInPeekModal()
  const translationMode = useGeneralSettingKey("translationMode")
  const actionLanguage = useGeneralSettingKey("actionLanguage")

  const tocRef = useRef<TocRef | null>(null)
  const contentAccessories = useMemo(
    () => (isInPeekModal ? undefined : <ContainerToc ref={tocRef} stickyClassName="top-48" />),
    [isInPeekModal],
  )

  useEffect(() => {
    if (tocRef) {
      tocRef.current?.refreshItems()
    }
  }, [content, tocRef])

  const ContentRenderer = useMemo(() => {
    return isMarkdownEntry ? EntryContentMarkdownRenderer : EntryContentHTMLRenderer
  }, [isMarkdownEntry])
  return (
    <ContentRenderer
      view={view}
      feedId={feedId}
      entryId={entryId}
      mediaInfo={mediaInfo}
      noMedia={noMedia}
      accessory={contentAccessories}
      as="article"
      className="autospace-normal prose !max-w-full hyphens-auto dark:prose-invert prose-h1:text-[1.6em] prose-h1:font-bold"
      style={stableRenderStyle}
      renderInlineStyle={readerRenderInlineStyle}
    >
      {normalizeRssContentForRender(
        resolveTranslationHtml({
          sourceHtml: content ?? "",
          translatedHtml: translation?.content,
          mode: translationMode,
          language: actionLanguage,
        }),
      )}
    </ContentRenderer>
  )
}
