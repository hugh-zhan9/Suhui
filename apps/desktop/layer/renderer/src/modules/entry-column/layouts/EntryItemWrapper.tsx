import { useGlobalFocusableScopeSelector } from "@suhui/components/common/Focusable/hooks.js"
import { useMobile } from "@suhui/components/hooks/useMobile.js"
import { getMousePosition } from "@suhui/components/hooks/useMouse.js"
import { ActionButton } from "@suhui/components/ui/button/action-button.js"
import { FeedViewType } from "@suhui/constants"
import { useEntry } from "@suhui/store/entry/hooks"
import { entryActions, entrySyncServices } from "@suhui/store/entry/store"
import { unreadSyncService } from "@suhui/store/unread/store"
import { cn } from "@suhui/utils/utils"
import type { FC, MouseEvent, PropsWithChildren, TouchEvent } from "react"
import { memo, useCallback, useEffect, useMemo } from "react"
import { NavLink } from "react-router"
import { useDebounceCallback } from "usehooks-ts"

import { useGeneralSettingKey } from "~/atoms/settings/general"
import { useUISettingKey } from "~/atoms/settings/ui"
import { FocusablePresets } from "~/components/common/Focusable"
import { useEntryIsRead } from "~/hooks/biz/useAsRead"
import { useContextMenuActionShortCutTrigger } from "~/hooks/biz/useContextMenuActionShortCutTrigger"
import { useEntryActions } from "~/hooks/biz/useEntryActions"
import { useEntryContextMenu } from "~/hooks/biz/useEntryContextMenu"
import { getNavigateEntryPath, useNavigateEntry } from "~/hooks/biz/useNavigateEntry"
import { getRouteParams, useRouteParamsSelector } from "~/hooks/biz/useRouteParams"
import { useShowEntryDetailsColumn } from "~/hooks/biz/useShowEntryDetailsColumn"
import { useFeedSafeUrl } from "~/hooks/common/useFeedSafeUrl"
import { htmlParserClient } from "~/lib/html-parser-client"
import { normalizeRssContentForRender } from "~/lib/rss-content-normalize"
import { setPendingActiveEntryId } from "../hooks/query-selection"
import { createEntryDetailPrefetch } from "./entry-detail-prefetch"

export const EntryItemWrapper: FC<
  {
    entryId: string
    view: FeedViewType
    isFirstItem?: boolean
    itemClassName?: string
    style?: React.CSSProperties
  } & PropsWithChildren
> = ({ entryId, view, children, itemClassName, style, isFirstItem }) => {
  const entry = useEntry(entryId, (state) => {
    const { feedId, inboxHandle } = state

    const { id, url } = state
    return { feedId, id, inboxId: inboxHandle, url }
  })
  const actionConfigs = useEntryActions({ entryId, view })
  const isMobile = useMobile()

  const isActive = useRouteParamsSelector(({ entryId }) => entryId === entry?.id, [entry?.id])
  const when = useGlobalFocusableScopeSelector(FocusablePresets.isTimeline)
  useContextMenuActionShortCutTrigger(actionConfigs, isActive && when)
  const showEntryDetailsColumn = useShowEntryDetailsColumn()

  const asRead = useEntryIsRead(entryId)
  const hoverMarkUnread = useGeneralSettingKey("hoverMarkUnread")
  const readerRenderInlineStyle = useUISettingKey("readerRenderInlineStyle")
  const detailPrefetch = useMemo(
    () =>
      entry?.id
        ? createEntryDetailPrefetch({
            entryId: entry.id,
            isDetailLoaded: (id) => entryActions.isDetailLoaded(id),
            fetchDetail: async (id) => {
              const detail = await entrySyncServices.fetchEntryDetail(id)
              if (detail?.content) {
                void htmlParserClient
                  .parse(normalizeRssContentForRender(detail.content), {
                    renderInlineStyle: readerRenderInlineStyle,
                    noMedia: false,
                  })
                  .catch(() => undefined)
              }
              return detail
            },
          })
        : null,
    [entry?.id, readerRenderInlineStyle],
  )
  useEffect(() => () => detailPrefetch?.dispose(), [detailPrefetch])

  const handleMouseEnterMarkRead = useDebounceCallback(
    () => {
      if (!hoverMarkUnread) return
      if (!document.hasFocus()) return
      if (asRead) return
      if (!entry?.id) return

      unreadSyncService.markRead(entry.id)
    },
    233,
    {
      leading: false,
    },
  )

  const handleMouseEnter = useMemo(() => {
    return () => {
      handleMouseEnterMarkRead()
      detailPrefetch?.schedule("pointer")
    }
  }, [detailPrefetch, handleMouseEnterMarkRead])
  const handleMouseLeave = useMemo(() => {
    return () => {
      handleMouseEnterMarkRead.cancel()
      detailPrefetch?.cancel("pointer")
    }
  }, [detailPrefetch, handleMouseEnterMarkRead])

  const navigate = useNavigateEntry()
  const navigationPath = useMemo(() => {
    if (!entry?.id) return "#"
    return getNavigateEntryPath({
      entryId: entry?.id,
    })
  }, [entry?.id])

  const populatedFullHref = useFeedSafeUrl(entryId)

  const handleDoubleClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (!entry?.url) return
      if (!entry?.id) return

      if (!populatedFullHref) return
      window.open(populatedFullHref, "_blank", "noopener,noreferrer")
    },
    [entry?.id, entry?.url, populatedFullHref],
  )

  const handleClick = useCallback(
    (e: TouchEvent<HTMLElement> | MouseEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()

      const shouldNavigate = getRouteParams().entryId !== entry?.id

      if (!shouldNavigate) return
      if (!entry?.id) return

      setPendingActiveEntryId(entry.id)
      navigate({
        view,
        entryId: entry.id,
      })
      queueMicrotask(() => {
        void unreadSyncService.markRead(entry.id)
      })
    },
    [entry?.id, navigate, view],
  )
  const { contextMenuProps, isContextMenuOpen, openContextMenuAt } = useEntryContextMenu({
    entryId,
    view,
    feedId: entry?.feedId || entry?.inboxId || "",
    actionConfigs,
  })

  const isWide = !showEntryDetailsColumn

  const Link = view === FeedViewType.SocialMedia ? "article" : NavLink
  const isAll = view === FeedViewType.All
  return (
    <div data-entry-id={entry?.id} style={style}>
      <Link
        to={navigationPath}
        className={cn(
          "group/entry-item relative block cursor-button overflow-visible duration-150 hover:bg-theme-item-hover",
          !isWide ? "rounded-none @[650px]:rounded-md" : "rounded-md",
          isAll && "!rounded-none",
          (isActive || isContextMenuOpen) && "!bg-theme-item-active",
          itemClassName,
        )}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={() => detailPrefetch?.schedule("focus")}
        onBlur={() => detailPrefetch?.cancel("focus")}
        {...contextMenuProps}
        {...(!isMobile ? { onTouchStart: handleClick } : {})}
      >
        {children}
        {isWide && (
          <ActionBar
            openContextMenu={() => {
              const { x, y } = getMousePosition()
              void openContextMenuAt(x, y)
            }}
            isFirstItem={!!isFirstItem}
            isAll={isAll}
            visible={isContextMenuOpen}
          />
        )}
      </Link>
    </div>
  )
}

const ActionBar = memo(
  ({
    openContextMenu,
    isFirstItem,
    isAll,
    visible,
  }: {
    openContextMenu: () => void
    isFirstItem: boolean
    isAll: boolean
    visible: boolean
  }) => {
    return (
      <div
        className={cn(
          "pointer-events-none absolute -right-2 top-0 -translate-y-1/2 rounded-lg border border-gray-200 bg-white/90 p-1 opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-100 group-hover/entry-item:pointer-events-auto group-hover/entry-item:opacity-100 dark:border-neutral-900 dark:bg-neutral-900",
          isFirstItem && "-right-2 top-4",
          isAll && "right-1 top-1/2",
          visible && "pointer-events-auto opacity-100",
        )}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
        }}
      >
        <div className="flex items-center gap-1">
          <ActionButton
            onClick={openContextMenu}
            size="xs"
            icon={<i className="i-mingcute-more-1-fill" />}
          />
        </div>
      </div>
    )
  },
)

ActionBar.displayName = "ActionBar"
