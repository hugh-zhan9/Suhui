import type { FeedViewType } from "@follow/constants"
import { useTypeScriptHappyCallback } from "@follow/hooks"
import { useId, useMemo, useState } from "react"
import type { StyleProp, ViewStyle } from "react-native"

import { PagerView } from "@/src/components/native/PagerView"
import { useViewWithSubscription } from "@/src/store/subscription/hooks"

import { selectTimeline, useSelectedFeed } from "./atoms"
import { PagerListVisibleContext, PagerListWillVisibleContext } from "./PagerListContext"

export function PagerList({
  renderItem,
  style,
}: {
  renderItem: (view: FeedViewType, active: boolean) => React.ReactNode
  style?: StyleProp<ViewStyle> | undefined
}) {
  const selectedFeed = useSelectedFeed()
  const viewId = selectedFeed?.type === "view" ? selectedFeed.viewId : undefined

  const activeViews = useViewWithSubscription()
  const activeViewIndex = useMemo(
    () => activeViews.findIndex((view) => view.view === viewId),
    [activeViews, viewId],
  )
  const [dragging, setDragging] = useState(false)
  const rid = useId()

  return (
    <PagerView
      onScrollBegin={() => setDragging(true)}
      onScrollEnd={() => setDragging(false)}
      pageContainerClassName="flex-1"
      containerClassName="flex-1 absolute inset-0"
      containerStyle={style}
      onPageChange={(targetIndex) => {
        selectTimeline({ type: "view", viewId: activeViews[targetIndex]!.view }, rid)
      }}
      renderPage={useTypeScriptHappyCallback(
        (index) => (
          <PagerListVisibleContext.Provider
            value={index === activeViewIndex}
            key={activeViews[index]!.view}
          >
            <PagerListWillVisibleContext.Provider
              value={(index === activeViewIndex + 1 || index === activeViewIndex - 1) && dragging}
            >
              {renderItem(activeViews[index]!.view, index === activeViewIndex)}
            </PagerListWillVisibleContext.Provider>
          </PagerListVisibleContext.Provider>
        ),
        [activeViews, activeViewIndex, dragging, renderItem],
      )}
      pageTotal={activeViews.length}
    />
  )
}
