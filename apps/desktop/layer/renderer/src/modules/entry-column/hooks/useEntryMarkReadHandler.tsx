import { getView } from "@suhui/constants"
import { entryActions } from "@suhui/store/entry/store"
import { unreadSyncService } from "@suhui/store/unread/store"
import type { Range } from "@tanstack/react-virtual"
import { useMemo } from "react"
import { useEventCallback } from "usehooks-ts"

import { useGeneralSettingKey } from "~/atoms/settings/general"
import { appLog } from "~/lib/log"
import { useRouteParamsSelector } from "~/hooks/biz/useRouteParams"

export const useEntryMarkReadHandler = (entriesIds: string[]) => {
  const renderAsRead = useGeneralSettingKey("renderMarkUnread")
  const scrollMarkUnread = useGeneralSettingKey("scrollMarkUnread")
  const feedView = useRouteParamsSelector((params) => params.view)
  const traceFlags = window.__startupReadTraceFlags

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const processedEntryIds = useMemo(() => new Set<string>(), [entriesIds])

  const handleRenderAsRead = useEventCallback(
    ({ startIndex, endIndex }: Range, enabled?: boolean) => {
      if (!enabled) return
      const idSlice = entriesIds?.slice(startIndex, endIndex)
      if (!idSlice) return

      // Filter out entries that have already been processed
      const newEntries = idSlice.filter((id) => !processedEntryIds.has(id))
      if (newEntries.length === 0) return

      // Mark these entries as processed to avoid duplicate processing
      newEntries.forEach((id) => processedEntryIds.add(id))

      batchMarkRead(newEntries)
    },
  )

  return useMemo(() => {
    const viewDef = getView(feedView)
    const treatAsWideMode = !!viewDef?.wideMode || !!traceFlags?.forceWideRenderMarkRead
    // For grid modes like Pictures, we never want to auto-mark-read on scroll
    // Users explicitly request that only clicking the picture to enter the article details does so
    if (viewDef?.gridMode) {
      return
    }

    if (treatAsWideMode && renderAsRead) {
      if (traceFlags?.enabled) {
        appLog("[startup-read-trace] useEntryMarkReadHandler:render-enabled", {
          label: traceFlags.label,
          feedView,
          viewWideMode: !!viewDef?.wideMode,
          forcedWideMode: !!traceFlags.forceWideRenderMarkRead,
          renderAsRead,
          scrollMarkUnread,
          entriesCount: entriesIds.length,
        })
      }
      return handleRenderAsRead
    }

    if (scrollMarkUnread) {
      if (traceFlags?.enabled) {
        appLog("[startup-read-trace] useEntryMarkReadHandler:scroll-enabled", {
          label: traceFlags.label,
          feedView,
          scrollMarkUnread,
          entriesCount: entriesIds.length,
        })
      }
      return handleRenderAsRead
    }
    return
  }, [entriesIds.length, feedView, handleRenderAsRead, renderAsRead, scrollMarkUnread, traceFlags])
}

export function batchMarkRead(ids: string[]) {
  const batchLikeIds = [] as string[]
  const dedupedInputIds = new Set<string>()
  const entriesId2Map = entryActions.getFlattenMapEntries()
  for (const id of ids) {
    if (dedupedInputIds.has(id)) continue
    dedupedInputIds.add(id)

    const entry = entriesId2Map[id]

    if (!entry) continue
    const isRead = entry.read
    if (!isRead && (entry.feedId || entry.inboxHandle)) {
      batchLikeIds.push(id)
    }
  }

  if (batchLikeIds.length > 0) {
    if (window.__startupReadTraceFlags?.enabled) {
      appLog("[startup-read-trace] batchMarkRead", {
        label: window.__startupReadTraceFlags.label,
        inputCount: ids.length,
        markedCount: batchLikeIds.length,
        firstIds: batchLikeIds.slice(0, 10),
      })
    }
    for (const id of batchLikeIds) {
      unreadSyncService.markRead(id)
    }
  }
}
