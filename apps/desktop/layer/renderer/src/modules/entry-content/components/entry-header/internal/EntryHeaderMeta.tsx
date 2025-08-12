import { AnimatePresence, m } from "motion/react"
import { memo } from "react"

interface EntryTitleMeta {
  title: string
  description?: string
}

interface EntryHeaderMetaProps {
  entryTitleMeta: Nullable<EntryTitleMeta>
  shouldShow: boolean
}

function EntryHeaderMetaImpl({ entryTitleMeta, shouldShow }: EntryHeaderMetaProps) {
  return (
    <div className="flex min-w-0 shrink grow">
      <AnimatePresence>
        {shouldShow && entryTitleMeta && (
          <m.div
            initial={{ opacity: 0.01, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0.01, y: 30 }}
            className="text-text text-title3 flex min-w-0 flex-1 shrink items-end gap-2 truncate leading-tight"
          >
            <span className="shrink truncate font-bold">{entryTitleMeta.title}</span>
            <i className="i-mgc-line-cute-re text-text-secondary size-[10px] shrink-0 translate-y-[-3px] rotate-[-25deg]" />
            <span className="text-text-secondary text-headline shrink -translate-y-px truncate">
              {entryTitleMeta.description}
            </span>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const EntryHeaderMeta = memo(EntryHeaderMetaImpl)
