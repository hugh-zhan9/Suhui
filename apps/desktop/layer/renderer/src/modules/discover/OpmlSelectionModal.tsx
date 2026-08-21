import { Button } from "@suhui/components/ui/button/index.js"
import { Checkbox } from "@suhui/components/ui/checkbox/index.jsx"
import { Input } from "@suhui/components/ui/input/index.js"
import { ScrollArea } from "@suhui/components/ui/scroll-area/index.js"
import { subscriptionSyncService } from "@suhui/store/subscription/store"
import { cn } from "@suhui/utils/utils"
import { useMutation } from "@tanstack/react-query"
import Fuse from "fuse.js"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { useCurrentModal } from "~/components/ui/modal/stacked/hooks"
import { toastFetchError } from "~/lib/error-parser"
import { localReadingIpc } from "~/lib/local-reading-ipc"
import { toast } from "~/lib/toast"

import type { ParsedOpmlItem } from "./types"

/**
 * OPML 导入的选择界面。
 *
 * 解析与导入都走主进程（`localReading.previewOpml` / `importOpml`）：没有远端配额，
 * 取而代之的是本地预览给出的 `duplicate` 标记——已订阅的源默认不勾选，导入时也会被跳过。
 */
export const OpmlSelectionModal = ({ items, xml }: { items: ParsedOpmlItem[]; xml: string }) => {
  const { dismiss } = useCurrentModal()
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(
    () => new Set(items.filter((item) => !item.duplicate).map((item) => item.index)),
  )

  const duplicateCount = useMemo(() => items.filter((item) => item.duplicate).length, [items])

  const importMutation = useMutation({
    mutationFn: async (indexes: number[]) => {
      const result = await localReadingIpc()?.importOpml({
        xml,
        selectedIndexes: indexes,
      })
      return result ?? { imported: 0, skipped: 0, total: items.length }
    },
    onSuccess: (result) => {
      void subscriptionSyncService.fetch()
      dismiss()
      toast.success(
        `已导入 ${result.imported} 个订阅${
          result.skipped > 0 ? `，跳过 ${result.skipped} 个（重复或未选中）` : ""
        }`,
      )
    },
    async onError(err) {
      toastFetchError(err)
    },
  })

  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: [
          { name: "title", weight: 0.7 },
          { name: "url", weight: 0.2 },
          { name: "category", weight: 0.1 },
        ],
        threshold: 0.3,
        includeMatches: true,
        minMatchCharLength: 2,
      }),
    [items],
  )

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items
    return fuse.search(searchQuery).map((result) => result.item)
  }, [fuse, searchQuery, items])

  const toggleItem = useCallback((index: number) => {
    setSelectedIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelectedIndexes((prev) => {
        const next = new Set(prev)
        for (const item of filteredItems) {
          if (checked) next.add(item.index)
          else next.delete(item.index)
        }
        return next
      })
    },
    [filteredItems],
  )

  const filteredSelectedCount = filteredItems.filter((item) =>
    selectedIndexes.has(item.index),
  ).length
  const allFilteredSelected =
    filteredSelectedCount === filteredItems.length && filteredItems.length > 0
  const someFilteredSelected =
    filteredSelectedCount > 0 && filteredSelectedCount < filteredItems.length

  return (
    <div className="flex h-full max-w-full flex-col">
      <div className="mb-4">
        <h3 className="mb-2 text-lg font-semibold">
          {t("discover.import.select_feeds_to_import")}
        </h3>
        <p className="text-sm text-text-secondary">
          {t("discover.import.select_feeds_description")}
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
        <span className="text-sm font-medium">
          共 {items.length} 个，已选 {selectedIndexes.size} 个
          {duplicateCount > 0 ? `，其中 ${duplicateCount} 个已订阅（默认不选）` : ""}
        </span>
      </div>

      <div className="mb-4">
        <Input
          placeholder={t("discover.import.search_feeds_placeholder", "Search feeds...")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full"
        />
      </div>

      <label
        className="mb-4 flex items-center gap-3 rounded-lg px-1 py-2"
        htmlFor="select-all-filtered-feeds"
      >
        <Checkbox
          id="select-all-filtered-feeds"
          checked={allFilteredSelected}
          onCheckedChange={toggleAll}
          indeterminate={someFilteredSelected}
        />
        <span className="font-medium">
          {searchQuery.trim()
            ? `${t("discover.import.select_all_filtered", "Select all filtered")} (${filteredSelectedCount}/${filteredItems.length})`
            : `${t("discover.import.select_all_feeds")} (${selectedIndexes.size}/${items.length})`}
        </span>
      </label>

      <ScrollArea.ScrollArea rootClassName="-mx-4 flex-1 px-2">
        <div className="space-y-2">
          {filteredItems.length === 0 && searchQuery.trim() ? (
            <div className="py-8 text-center text-text-secondary">
              {t("discover.import.no_feeds_found", "No feeds found matching your search.")}
            </div>
          ) : (
            filteredItems.map((item) => {
              const isSelected = selectedIndexes.has(item.index)

              return (
                <div
                  key={`${item.url}-${item.index}`}
                  className={cn(
                    "flex cursor-button items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-material-medium",
                    isSelected ? "border-material-thick bg-material-thick" : "border-background",
                  )}
                  onClick={() => toggleItem(item.index)}
                >
                  <Checkbox checked={isSelected} />
                  <div className="min-w-0 flex-1 shrink">
                    <div className="truncate font-medium">
                      {item.title || "Untitled Feed"}
                      {item.duplicate ? (
                        <span className="ml-2 text-xs text-text-secondary">已订阅</span>
                      ) : null}
                    </div>
                    <div className="truncate text-sm text-text-secondary">{item.url}</div>
                    {item.category ? (
                      <div className="mt-1 text-xs text-text-secondary opacity-80">
                        {item.category}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea.ScrollArea>

      <div className="mt-4 flex justify-end gap-3">
        <Button variant="outline" onClick={dismiss} disabled={importMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => importMutation.mutate([...selectedIndexes])}
          disabled={selectedIndexes.size === 0 || importMutation.isPending}
          isLoading={importMutation.isPending}
        >
          {t("words.import")} ({selectedIndexes.size})
        </Button>
      </div>
    </div>
  )
}
