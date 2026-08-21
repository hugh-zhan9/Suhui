import type { FeedViewType } from "@suhui/constants"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  MENU_ITEM_SEPARATOR,
  MenuItemSeparator,
  MenuItemText,
  useShowContextMenu,
} from "~/atoms/context-menu"
import type { EntryActionItem } from "~/hooks/biz/useEntryActions"
import { HIDE_ACTIONS_IN_ENTRY_CONTEXT_MENU } from "~/hooks/biz/useEntryActions"
import { useFeedActions } from "~/hooks/biz/useFeedActions"
import { useContextMenu } from "~/hooks/common/useContextMenu"
import { copyToClipboard } from "~/lib/clipboard"

export function useEntryContextMenu({
  entryId,
  view,
  feedId,
  actionConfigs: providedActionConfigs,
}: {
  entryId: string
  view: FeedViewType
  feedId: string
  actionConfigs?: Array<EntryActionItem | false | null | undefined>
}) {
  const { t } = useTranslation("common")
  const showContextMenu = useShowContextMenu()

  const actionConfigs = providedActionConfigs ?? []
  const feedItems = useFeedActions({ feedId, view, type: "entryList" })

  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false)

  const buildMenuItems = useCallback(() => {
    return [
      ...actionConfigs.filter((item) => {
        // 条目动作允许按条件拼装（cond && new EntryActionMenuItem()），先滤掉假值
        if (!item) return false
        if (item instanceof MenuItemSeparator) return true

        return !HIDE_ACTIONS_IN_ENTRY_CONTEXT_MENU.includes(item.id)
      }),
      MENU_ITEM_SEPARATOR,
      ...feedItems.filter((item) => {
        if (item instanceof MenuItemSeparator) return true

        return item && !item.disabled
      }),
      MENU_ITEM_SEPARATOR,
      new MenuItemText({
        label: `${t("words.copy")}${t("space")}${t("words.entry")} ${t("words.id")}`,
        click: () => copyToClipboard(entryId),
      }),
    ]
  }, [actionConfigs, feedItems, t, entryId])

  const contextMenuProps = useContextMenu({
    onContextMenu: async (e) => {
      const $target = e.target as HTMLElement
      const selection = window.getSelection()
      if (selection) {
        const targetHasSelection =
          selection?.toString().length > 0 && $target.contains(selection?.anchorNode)
        if (targetHasSelection) {
          e.stopPropagation()
          return
        }
      }

      e.preventDefault()
      setIsContextMenuOpen(true)
      await showContextMenu(buildMenuItems(), e)
      setIsContextMenuOpen(false)
    },
  })

  const openContextMenuAt = useCallback(
    async (x: number, y: number) => {
      const mouseEvent = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      })
      // Delegate to the same onContextMenu handler
      // @ts-expect-error MouseEvent type alignment
      await contextMenuProps.onContextMenu?.(mouseEvent)
    },
    [contextMenuProps],
  )

  return useMemo(
    () => ({ contextMenuProps, isContextMenuOpen, openContextMenuAt }),
    [contextMenuProps, isContextMenuOpen, openContextMenuAt],
  )
}
