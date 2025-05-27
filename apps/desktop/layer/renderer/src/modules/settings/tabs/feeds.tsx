import { Spring } from "@follow/components/constants/spring.js"
import { MotionButtonBase } from "@follow/components/ui/button/index.js"
import { Checkbox } from "@follow/components/ui/checkbox/index.js"
import { Divider } from "@follow/components/ui/divider/index.js"
import { LoadingCircle } from "@follow/components/ui/loading/index.jsx"
import { ScrollArea } from "@follow/components/ui/scroll-area/index.js"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@follow/components/ui/table/index.jsx"
import { EllipsisHorizontalTextWithTooltip } from "@follow/components/ui/typography/index.js"
import { views } from "@follow/constants"
import clsx from "clsx"
import { AnimatePresence, m } from "motion/react"
import type { FC } from "react"
import { memo, useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { useIsInMASReview } from "~/atoms/server-configs"
import { RelativeDay } from "~/components/ui/datetime"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu/dropdown-menu"
import { useDialog } from "~/components/ui/modal/stacked/hooks"
import { useBatchUpdateSubscription } from "~/hooks/biz/useSubscriptionActions"
import { useAuthQuery } from "~/hooks/common"
import { UrlBuilder } from "~/lib/url-builder"
import { FeedIcon } from "~/modules/feed/feed-icon"
import { useConfirmUnsubscribeSubscriptionModal } from "~/modules/modal/hooks/useConfirmUnsubscribeSubscriptionModal"
import { Balance } from "~/modules/wallet/balance"
import { Queries } from "~/queries"
import { useFeedById } from "~/store/feed"
import { useAllFeeds, useSubscriptionByFeedId } from "~/store/subscription"

export const SettingFeeds = () => {
  const inMas = useIsInMASReview()
  return (
    <div className="space-y-4 pb-8">
      <SubscriptionFeedsSection />
      {!inMas && <FeedClaimedSection />}
    </div>
  )
}

const GRID_COLS_CLASSNAME = tw`grid-cols-[30px_auto_150px_100px]`

const SubscriptionFeedsSection = () => {
  const { t } = useTranslation("settings")
  const feedList = useAllFeeds()
  const [selectedFeeds, setSelectedFeeds] = useState<Set<string>>(() => new Set())

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedFeeds(new Set(feedList.map((feed) => feed.id)))
      } else {
        setSelectedFeeds(new Set())
      }
    },
    [feedList],
  )

  const handleSelectFeed = useCallback((feedId: string, checked: boolean) => {
    setSelectedFeeds((prev) => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(feedId)
      } else {
        newSet.delete(feedId)
      }
      return newSet
    })
  }, [])

  const isAllSelected = feedList.length > 0 && selectedFeeds.size === feedList.length

  const presentDeleteSubscription = useConfirmUnsubscribeSubscriptionModal()
  const handleBatchUnsubscribe = useCallback(() => {
    const feedIds = Array.from(selectedFeeds)
    presentDeleteSubscription(feedIds)
  }, [presentDeleteSubscription, selectedFeeds])

  return (
    <section className="relative mt-4">
      <h2 className="mb-2 text-lg font-semibold">{t("feeds.subscription")}</h2>

      {feedList.length > 0 && (
        <div className="mt-8 space-y-1">
          {/* Header - Sticky */}
          <div
            className={clsx(
              "bg-background text-text-secondary sticky top-0 z-20 grid h-8 gap-4 border-b px-1 pb-2 text-sm font-medium",
              GRID_COLS_CLASSNAME,
            )}
          >
            <div className="flex items-center justify-center">
              <Checkbox checked={isAllSelected} onCheckedChange={handleSelectAll} />
            </div>
            <div>{t("feeds.tableHeaders.name")}</div>
            <div className="ml-4">View</div>
            <div className="text-center">Date</div>
          </div>

          {/* Feed List */}
          {feedList.map((item) => {
            return (
              <FeedListItem
                key={item.id}
                id={item.id}
                selected={selectedFeeds.has(item.id)}
                onSelect={handleSelectFeed}
              />
            )
          })}

          {/* Sticky Action Bar at bottom when scrolled */}
          <AnimatePresence>
            {selectedFeeds.size > 0 && (
              <>
                <m.div
                  initial={{ opacity: 0, transform: "translateY(10px)" }}
                  animate={{ opacity: 1, transform: "translateY(0)" }}
                  exit={{ opacity: 0, transform: "translateY(10px)" }}
                  transition={Spring.presets.smooth}
                  className="sticky bottom-16 mt-4 flex justify-center"
                >
                  <div className="text-text-secondary bg-material-opaque rounded-md px-4 py-2 text-sm">
                    {selectedFeeds.size} item(s) selected
                    <button
                      className="text-accent cursor-button ml-3 text-xs"
                      type="button"
                      onClick={() => setSelectedFeeds(new Set())}
                    >
                      Clear
                    </button>
                  </div>
                </m.div>
                <m.div
                  initial={{ opacity: 0, transform: "translateY(10px)" }}
                  animate={{ opacity: 1, transform: "translateY(0)" }}
                  exit={{ opacity: 0, transform: "translateY(10px)" }}
                  transition={Spring.presets.smooth}
                  className="sticky bottom-4 flex justify-center"
                >
                  <div className="bg-material-opaque flex items-center gap-2 rounded px-4 py-2">
                    {/* <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="text-accent text-xs"
                          type="button"
                          onClick={handleBatchMoveToView}
                        >
                          Add to Category
                        </button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent side="top">
                        <CategorySelector />
                      </DropdownMenuContent>
                    </DropdownMenu> */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <MotionButtonBase className="text-accent text-xs" type="button">
                          Move to View
                        </MotionButtonBase>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="top">
                        <ViewSelector selectedFeeds={selectedFeeds} />
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <MotionButtonBase
                      className="text-red text-xs"
                      type="button"
                      onClick={handleBatchUnsubscribe}
                    >
                      Unsubscribe
                    </MotionButtonBase>
                  </div>
                </m.div>
              </>
            )}
          </AnimatePresence>
        </div>
      )}
    </section>
  )
}

const ViewSelector: FC<{ selectedFeeds: Set<string> }> = ({ selectedFeeds }) => {
  const { t: tCommon } = useTranslation("common")
  const { mutate: batchUpdateSubscription } = useBatchUpdateSubscription()
  const { ask } = useDialog()
  return views.map((view) => {
    return (
      <DropdownMenuItem
        key={view.view}
        icon={view.icon}
        onClick={() => {
          ask({
            title: "Confirm",
            message: `Are you sure you want to move these feeds to ${tCommon(view.name)}?`,
            onConfirm: () => {
              batchUpdateSubscription({
                feedIdList: Array.from(selectedFeeds),
                view: view.view,
              })
            },
          })
        }}
      >
        {tCommon(view.name)}
      </DropdownMenuItem>
    )
  })
}

const FeedListItem = memo(
  ({
    id,
    selected,
    onSelect,
  }: {
    id: string
    selected: boolean
    onSelect: (feedId: string, checked: boolean) => void
  }) => {
    const subscription = useSubscriptionByFeedId(id)
    const feed = useFeedById(id)
    const isCustomizeName = subscription?.title && feed?.title !== subscription?.title
    const { t: tCommon } = useTranslation("common")

    if (!subscription) return null

    return (
      <button
        type="button"
        tabIndex={-1}
        className={clsx(
          "hover:bg-material-medium grid h-10 w-full items-center gap-4 rounded px-1",
          GRID_COLS_CLASSNAME,
        )}
        onClick={() => onSelect(id, !selected)}
      >
        <div className="flex items-center justify-center">
          <Checkbox checked={selected} onCheckedChange={(checked) => onSelect(id, !!checked)} />
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <FeedIcon feed={feed} size={16} />
          <div className="flex min-w-0 flex-col">
            <EllipsisHorizontalTextWithTooltip className="text-text font-medium">
              {subscription.title || feed?.title}
            </EllipsisHorizontalTextWithTooltip>
            {isCustomizeName && (
              <EllipsisHorizontalTextWithTooltip className="text-text-secondary text-sm">
                {feed?.title}
              </EllipsisHorizontalTextWithTooltip>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-text-secondary text-sm">{views[subscription.view]!.icon}</span>
          <span>{tCommon(views[subscription.view]!.name)}</span>
        </div>
        <div className="text-center">
          <RelativeDay date={new Date(subscription.createdAt)} />
        </div>
      </button>
    )
  },
)

const FeedClaimedSection = () => {
  const { t } = useTranslation("settings")
  const claimedList = useAuthQuery(Queries.feed.claimedList())

  const numberFormatter = useMemo(() => new Intl.NumberFormat("en-US", {}), [])

  return (
    <section className="mt-4">
      <div>
        <h2 className="mb-2 text-lg font-semibold">{t("feeds.claim")}</h2>
      </div>
      <div className="mb-4 space-y-2 text-sm">
        <p>{t("feeds.claimTips")}</p>
      </div>
      <Divider className="mb-6 mt-8" />
      <div className="flex flex-1 flex-col">
        {claimedList.isLoading ? (
          <LoadingCircle size="large" className="center h-36" />
        ) : !claimedList.data?.length ? (
          <div className="text-text-secondary mt-36 w-full text-center text-sm">
            <p>{t("feeds.noFeeds")}</p>
          </div>
        ) : null}
        {claimedList.data?.length ? (
          <ScrollArea.ScrollArea viewportClassName="max-h-[380px]">
            <Table className="mt-4">
              <TableHeader className="border-b">
                <TableRow className="[&_*]:!font-semibold">
                  <TableHead className="w-16 text-center" size="sm">
                    {t("feeds.tableHeaders.name")}
                  </TableHead>
                  <TableHead className="text-center" size="sm">
                    {t("feeds.tableHeaders.subscriptionCount")}
                  </TableHead>
                  <TableHead className="text-center" size="sm">
                    {t("feeds.tableHeaders.tipAmount")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="border-t-[12px] border-transparent">
                {claimedList.data?.map((row) => (
                  <TableRow key={row.feed.id} className="h-8">
                    <TableCell size="sm" width={200}>
                      <a
                        target="_blank"
                        href={UrlBuilder.shareFeed(row.feed.id)}
                        className="flex items-center"
                      >
                        <FeedIcon fallback feed={row.feed} size={16} />
                        <EllipsisHorizontalTextWithTooltip className="inline-block max-w-[200px] truncate">
                          {row.feed.title}
                        </EllipsisHorizontalTextWithTooltip>
                      </a>
                    </TableCell>
                    <TableCell align="center" className="tabular-nums" size="sm">
                      {numberFormatter.format(row.subscriptionCount)}
                    </TableCell>
                    <TableCell align="center" size="sm">
                      <Balance>{BigInt(row.tipAmount || 0n)}</Balance>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea.ScrollArea>
        ) : null}
      </div>
    </section>
  )
}
