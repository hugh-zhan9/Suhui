import { LoadingCircle } from "@suhui/components/ui/loading/index.jsx"
import { useScrollViewElement } from "@suhui/components/ui/scroll-area/hooks.js"
import type { MutableRefObject } from "react"
import { useEffect, useRef } from "react"
import { useInView } from "react-intersection-observer"

import type { useFeedHistory } from "../hooks/useFeedHistory"

export function FeedHistoryFooter({
  history,
  interacted,
}: {
  history: ReturnType<typeof useFeedHistory>
  interacted: MutableRefObject<boolean>
}) {
  const scroll = useScrollViewElement()
  const element = useRef<HTMLDivElement | null>(null)
  const { ref, inView } = useInView({ root: scroll, threshold: 0 })
  const { loading, status, error, loadMore } = history

  useEffect(() => {
    if (!scroll) return
    const loadIfVisible = () => {
      const node = element.current
      if (!node || !interacted.current || loading || error || status !== "more") return
      const bounds = node.getBoundingClientRect()
      const viewport = scroll.getBoundingClientRect()
      if (bounds.top <= viewport.bottom && bounds.bottom >= viewport.top) void loadMore()
    }
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY <= 0) return
      interacted.current = true
      loadIfVisible()
    }
    scroll.addEventListener("wheel", onWheel, { passive: true })
    scroll.addEventListener("scroll", loadIfVisible, { passive: true })
    if (inView) loadIfVisible()
    return () => {
      scroll.removeEventListener("wheel", onWheel)
      scroll.removeEventListener("scroll", loadIfVisible)
    }
  }, [scroll, inView, interacted, loading, error, status, loadMore])

  return (
    <div
      ref={(node) => {
        element.current = node
        ref(node)
      }}
      className="flex min-h-16 flex-col items-center justify-center gap-2 p-4 text-center text-xs text-text-secondary"
      onClick={(event) => event.stopPropagation()}
      aria-live="polite"
    >
      {loading ? (
        <>
          <LoadingCircle size="small" />
          <span>正在加载更早的文章…</span>
        </>
      ) : error ? (
        <>
          <span>历史文章加载失败</span>
          <span className="max-w-full select-text break-words text-text-tertiary">{error}</span>
          <button
            type="button"
            className="rounded px-3 py-1 text-accent hover:bg-fill-quaternary"
            onClick={() => void loadMore(true)}
          >
            重试
          </button>
        </>
      ) : (
        <span>
          {status === "complete"
            ? "已加载该网站可识别的历史文章"
            : status === "unsupported"
              ? "此网站暂不支持自动补全历史文章"
              : status === "limit"
                ? "已达到本次历史扫描上限"
                : "继续向下滚动，加载更早的文章"}
        </span>
      )}
    </div>
  )
}
