import { cn, formatEstimatedMins, formatTimeToSeconds } from "@follow/utils/utils"
import { useCallback, useMemo, useRef } from "react"

import { useUISettingKey } from "~/atoms/settings/ui"
import { useWhoami } from "~/atoms/user"
import { RelativeTime } from "~/components/ui/datetime"
import { FeedIcon } from "~/modules/feed/feed-icon"
import { useEntryTranslation } from "~/store/ai/hook"
import { useEntry, useEntryReadHistory } from "~/store/entry"
import { getPreferredTitle, useFeedById } from "~/store/feed"
import { useInboxById } from "~/store/inbox"

import { EntryTranslation } from "../../entry-column/translation"

interface EntryLinkProps {
  entryId: string
  compact?: boolean
}

const safeUrl = (url: string, baseUrl: string) => {
  try {
    return new URL(url, baseUrl).href
  } catch {
    return url
  }
}

export const EntryTitle = ({ entryId, compact }: EntryLinkProps) => {
  const user = useWhoami()
  const entry = useEntry(entryId)
  const feed = useFeedById(entry?.feedId)
  const inbox = useInboxById(entry?.inboxId)
  const entryHistory = useEntryReadHistory(entryId)

  const populatedFullHref = useMemo(() => {
    if (inbox) return entry?.entries.authorUrl
    const href = entry?.entries.url
    if (!href) return "#"

    if (href.startsWith("http")) {
      const domain = new URL(href).hostname
      if (domain === "localhost") return "#"

      return href
    }
    const feedSiteUrl = feed?.type === "feed" ? feed.siteUrl : null
    if (href.startsWith("/") && feedSiteUrl) return safeUrl(href, feedSiteUrl)
    return href
  }, [entry?.entries.authorUrl, entry?.entries.url, feed?.siteUrl, feed?.type, inbox])

  const translation = useEntryTranslation({ entry, extraFields: ["title"] })

  const dateFormat = useUISettingKey("dateFormat")

  const audioAttachment = useMemo(() => {
    return entry?.entries?.attachments?.find((a) => a.mime_type?.startsWith("audio") && a.url)
  }, [entry?.entries?.attachments])

  const estimatedMins = useMemo(() => {
    if (!audioAttachment?.duration_in_seconds) {
      return
    }

    const durationInSeconds = formatTimeToSeconds(audioAttachment.duration_in_seconds)
    if (!durationInSeconds) {
      return
    }

    return formatEstimatedMins(Math.floor(durationInSeconds / 60))
  }, [audioAttachment])

  const titleRef = useRef<HTMLAnchorElement>(null)

  const handleMouseEnter = () => {
    if (!titleRef.current) return
    titleRef.current.style.transition = "transform 0.2s cubic-bezier(0.33, 1, 0.68, 1)"
  }

  const handleMouseLeave = () => {
    if (!titleRef.current) return
    titleRef.current.style.transform = "translate(0px, 0px)"
    titleRef.current.style.transition = "transform 0.4s cubic-bezier(0.33, 1, 0.68, 1)"
  }

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!titleRef.current) return
    const rect = titleRef.current.getBoundingClientRect()

    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    const distanceX = (e.clientX - centerX) * 0.05
    const distanceY = (e.clientY - centerY) * 0.05

    titleRef.current.style.transform = `translate(${distanceX}px, ${distanceY}px)`
  }, [])

  if (!entry) return null

  return compact ? (
    <div className="cursor-button @sm:-mx-3 @sm:p-3 -mx-6 flex items-center gap-2 rounded-lg p-6 transition-colors">
      <FeedIcon fallback feed={feed || inbox} entry={entry.entries} size={50} />
      <div className="leading-6">
        <div className="flex items-center gap-1 text-base font-semibold">
          <span>{entry.entries.author || feed?.title || inbox?.title}</span>
        </div>
        <div className="text-zinc-500">
          <RelativeTime date={entry.entries.publishedAt} />
        </div>
      </div>
    </div>
  ) : (
    <div className="@sm:-mx-3 @sm:p-3 group relative block min-w-0 rounded-lg lg:-mx-6 lg:p-6">
      <div className="flex flex-col gap-2">
        {/* Title Section with subtle hover effect */}
        <div>
          <a
            className="cursor-link flex items-center text-sm font-medium text-zinc-800/90 duration-200 hover:text-zinc-900 dark:text-zinc-300/90 dark:hover:text-zinc-100"
            href={feed?.siteUrl ?? feed?.url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FeedIcon fallback feed={feed || inbox} entry={entry.entries} size={16} />
            {getPreferredTitle(feed || inbox, entry.entries)}
          </a>
          <a
            href={populatedFullHref ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            ref={titleRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseMove={handleMouseMove}
            className={cn(
              "cursor-link relative select-text break-words text-2xl font-medium leading-normal",
              "inline-block transition-all duration-200 ease-out",
              "before:absolute before:-inset-x-2 before:inset-y-0 before:rounded-xl before:bg-black/[0.03] before:opacity-0 before:transition-opacity hover:before:opacity-100 dark:before:bg-white/[0.07]",
            )}
          >
            <EntryTranslation
              source={entry.entries.title}
              target={translation.data?.title}
              className="select-text hyphens-auto"
            />
          </a>
        </div>

        {/* Meta Information with improved layout */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-4 text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1.5 transition-colors hover:text-gray-700 dark:hover:text-gray-300">
              <i className="i-mgc-calendar-time-add-cute-re text-[1.1em]" />
              <span className="text-xs tabular-nums">
                <RelativeTime date={entry.entries.publishedAt} dateFormatTemplate={dateFormat} />
              </span>
            </div>

            {estimatedMins && (
              <div className="flex items-center gap-1.5 transition-colors hover:text-gray-700 dark:hover:text-gray-300">
                <i className="i-mgc-time-cute-re text-[1.1em]" />
                <span className="text-xs tabular-nums">{estimatedMins}</span>
              </div>
            )}

            {(() => {
              const readCount =
                (entryHistory?.readCount ?? 0) +
                (entryHistory?.userIds?.every((id) => id !== user?.id) ? 1 : 0)

              return readCount > 0 ? (
                <div className="flex items-center gap-1.5 transition-colors hover:text-gray-700 dark:hover:text-gray-300">
                  <i className="i-mgc-eye-2-cute-re text-[1.1em]" />
                  <span className="text-xs tabular-nums">{readCount.toLocaleString()}</span>
                </div>
              ) : null
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
