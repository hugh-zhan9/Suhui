import { ScrollArea } from "@follow/components/ui/scroll-area/index.js"
import { getEntry, getEntryIdsByFeedId } from "@follow/store/entry/getter"
import { cn } from "@follow/utils/utils"
import { useForceUpdate } from "motion/react"
import { useRef } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu/dropdown-menu"
import { useNavigateEntry } from "~/hooks/biz/useNavigateEntry"

import { useEntryContentScrollToTop, useEntryTitleMeta } from "../../../atoms"
import { useEntryHeaderContext } from "./context"

export function EntryHeaderBreadcrumb() {
  const meta = useEntryTitleMeta()
  const isAtTop = useEntryContentScrollToTop()
  const navigate = useNavigateEntry()
  const { entryId } = useEntryHeaderContext()

  const siblingEntriesRef = useRef<{ id: string; title: string }[]>([])
  const [forceUpdate] = useForceUpdate()

  const handleRefreshDropDownData = () => {
    const entry = getEntry(entryId)
    if (!entry) return
    const { feedId } = entry

    if (!feedId) return
    const entryIds = getEntryIdsByFeedId(feedId)
    if (!entryIds) return

    siblingEntriesRef.current = []
    for (const entryId of entryIds) {
      const entry = getEntry(entryId)
      if (!entry) continue
      const { title } = entry
      if (!title) continue
      siblingEntriesRef.current.push({ id: entryId, title })
    }

    siblingEntriesRef.current = siblingEntriesRef.current.slice(0, 30)

    forceUpdate()
  }
  if (!meta) return null

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
      <nav
        aria-label="Breadcrumb"
        className={cn(
          "text-text-secondary group/breadcrumb flex min-w-0 items-center gap-1 truncate leading-tight",
          !isAtTop && "text-text",
        )}
      >
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            className={cn(
              "text-text-secondary hover:text-text hover:bg-fill/50 focus-visible:bg-fill/60 inline-flex max-w-[40vw] items-center truncate rounded bg-transparent px-1.5 py-0.5 text-sm transition-colors",
            )}
            onClick={() => navigate({ entryId: null })}
            title={meta.feedTitle}
          >
            <span className="truncate">{meta.feedTitle}</span>
          </button>

          <DropdownMenu onOpenChange={handleRefreshDropDownData}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="text-text-tertiary hover:text-text focus-visible:bg-fill/60 -ml-2 inline-flex size-6 items-center justify-center rounded transition-colors"
                aria-label="Open entries from this feed"
              >
                <i className="i-mingcute-down-line size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="p-0">
              <ScrollArea.ScrollArea rootClassName="max-h-[60vh] min-w-64">
                <div className="p-1">
                  {siblingEntriesRef.current.map((e) => (
                    <DropdownMenuItem
                      key={e.id}
                      onClick={() => navigate({ entryId: e.id })}
                      checked={e.id === entryId}
                    >
                      <span className="truncate" title={e.title}>
                        {e.title}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </div>
              </ScrollArea.ScrollArea>
            </DropdownMenuContent>
          </DropdownMenu>

          <i className="i-mingcute-right-line text-text-tertiary size-4 shrink-0" />

          <span className="text-text truncate px-1.5 py-0.5 text-sm" title={meta.entryTitle}>
            {meta.entryTitle}
          </span>
        </div>
      </nav>
    </div>
  )
}
