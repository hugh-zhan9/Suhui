import { useEntry } from "@suhui/store/entry/hooks"
import { cn } from "@suhui/utils/utils"

import { HTML } from "~/components/ui/markdown/HTML"
import { readableContentMaxWidthClassName } from "~/constants/ui"
import { useEntryIsInReadability } from "~/atoms/readability"
import { useRenderStyle } from "~/hooks/biz/useRenderStyle"
import { useGeneralSettingKey } from "~/atoms/settings/general"
import { resolveTranslationHtml } from "~/lib/bilingual-html"
import { normalizeRssContentForRender } from "~/lib/rss-content-normalize"

interface ContentBodyProps {
  entryId: string
  className?: string
  compact?: boolean
  noMedia?: boolean
  translation?: {
    content?: string
    title?: string
  }
}

export const ContentBody: React.FC<ContentBodyProps> = ({
  entryId,
  className,
  compact = false,
  noMedia = false,
  translation,
}) => {
  const entry = useEntry(entryId, (state) => ({
    content: state.content,
    description: state.description,
    readabilityContent: state.readabilityContent,
  }))

  const renderStyle = useRenderStyle({
    baseFontSize: compact ? 14 : 16,
    baseLineHeight: compact ? 1.625 : 1.7,
  })
  const translationMode = useGeneralSettingKey("translationMode")
  const actionLanguage = useGeneralSettingKey("actionLanguage")
  const isInReadabilityMode = useEntryIsInReadability(entryId)

  if (!entry) return null

  const sourceContent =
    (isInReadabilityMode ? entry.readabilityContent : entry.content) || entry.description || ""

  const content = normalizeRssContentForRender(
    resolveTranslationHtml({
      sourceHtml: sourceContent,
      translatedHtml: translation?.content,
      mode: translationMode,
      language: actionLanguage,
    }),
  )

  if (!content) return null

  return (
    <HTML
      as="div"
      className={cn(
        "prose dark:prose-invert",
        "prose-blockquote:mt-0",
        "cursor-auto select-text",
        readableContentMaxWidthClassName,
        compact ? "text-sm leading-relaxed" : "text-base leading-relaxed",
        className,
      )}
      noMedia={noMedia}
      style={renderStyle}
    >
      {content}
    </HTML>
  )
}
