import { cn } from "@suhui/utils/utils"
import { useMemo } from "react"

import { useGeneralSettingKey } from "~/atoms/settings/general"
import { HTML } from "~/components/ui/markdown/HTML"

export const EntryTranslation: Component<{
  source?: string | null
  target?: string | null
  isHTML?: boolean
  inline?: boolean
  bilingual?: boolean
}> = ({ source, target, className, isHTML, inline = true, bilingual }) => {
  const bilingualFinal = useGeneralSettingKey("translationMode") === "bilingual" || bilingual
  const actionLanguage = useGeneralSettingKey("actionLanguage")

  const nextTarget = useMemo(() => {
    if (!target || source === target) {
      return ""
    }
    return target
  }, [source, target])

  if (!source) {
    return null
  }

  if (!bilingualFinal) {
    return (
      <div lang={nextTarget ? actionLanguage : undefined}>
        {isHTML ? (
          <HTML as="div" className={cn("prose dark:prose-invert", className)} noMedia>
            {nextTarget || source}
          </HTML>
        ) : (
          <div className={className}>{nextTarget || source}</div>
        )}
      </div>
    )
  }

  const SourceTag = inline ? "span" : "p"

  return (
    <>
      {isHTML ? (
        <div>
          <HTML as="div" className={cn("prose dark:prose-invert", className)} noMedia>
            {source}
          </HTML>
          {nextTarget && (
            <HTML
              as="div"
              lang={actionLanguage}
              className={cn("suhui-bilingual-translation prose dark:prose-invert", className)}
              noMedia
            >
              {nextTarget}
            </HTML>
          )}
        </div>
      ) : (
        <div className={cn(inline && "inline align-middle", className)}>
          <SourceTag className={cn(inline && "align-middle")}>{source}</SourceTag>
          {nextTarget && inline && (
            <>
              <i className="i-mgc-translate-2-ai-cute-re mx-2 align-middle" />
              <span className="align-middle" lang={actionLanguage}>
                {nextTarget}
              </span>
            </>
          )}
          {nextTarget && !inline && <p lang={actionLanguage}>{nextTarget}</p>}
        </div>
      )}
    </>
  )
}
