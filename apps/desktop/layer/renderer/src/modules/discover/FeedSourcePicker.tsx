import { cn } from "@suhui/utils/utils"
import type { FC } from "react"

export type FeedSourceOptionModel = {
  url: string
  kind: "feed" | "scraped"
  itemCount: number
  /** Epoch ms of the newest dated item, or null when nothing carries a date. */
  newestPublishedAt: number | null
}

const KIND_LABEL: Record<FeedSourceOptionModel["kind"], string> = {
  feed: "站点订阅源",
  scraped: "从页面抓取",
}

const KIND_DESCRIPTION: Record<FeedSourceOptionModel["kind"], string> = {
  feed: "站点自己提供的 RSS/Atom 地址，含正文",
  scraped: "从网页文章列表生成，只有标题、链接和时间",
}

const formatNewest = (at: number | null) => {
  if (!at) return "无发布时间"
  return new Date(at).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

/**
 * Shown only when a site offers more than one usable source — in practice when
 * its advertised feed has stopped tracking the page.
 */
export const FeedSourcePicker: FC<{
  options: FeedSourceOptionModel[]
  activeUrl?: string
  staleLagDays?: number
  disabled?: boolean
  onSelect: (url: string) => void
}> = ({ options, activeUrl, staleLagDays, disabled, onSelect }) => {
  if (options.length < 2) return null

  return (
    <div className="mb-4 rounded-lg border border-border bg-material-ultra-thin p-3">
      <div className="mb-2.5 flex items-start gap-2 text-callout text-text-secondary">
        <i className="i-mgc-warning-cute-re mt-0.5 shrink-0" />
        <span>
          {typeof staleLagDays === "number"
            ? `该站点的订阅源比页面最新文章落后 ${staleLagDays} 天，可能已经停止更新。请选择订阅哪一个来源：`
            : "该站点有多个可用来源，请选择订阅哪一个："}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {options.map((option) => {
          const selected = option.url === activeUrl

          return (
            <button
              key={option.url}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(option.url)}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors",
                selected
                  ? "border-accent bg-accent/5"
                  : "border-transparent bg-fill-secondary hover:bg-material-medium",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <i
                className={cn(
                  "mt-0.5 shrink-0",
                  selected ? "i-mgc-check-circle-filled text-accent" : "i-mgc-round-cute-re",
                )}
              />
              <span className="min-w-0 grow">
                <span className="flex flex-wrap items-center gap-x-2 text-body">
                  <span className="font-medium">{KIND_LABEL[option.kind]}</span>
                  <span className="text-caption text-text-secondary">
                    最新 {formatNewest(option.newestPublishedAt)} · {option.itemCount} 条
                  </span>
                </span>
                <span className="mt-0.5 block text-caption text-text-tertiary">
                  {KIND_DESCRIPTION[option.kind]}
                </span>
                <span className="mt-0.5 block truncate text-caption text-text-tertiary">
                  {option.url}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
