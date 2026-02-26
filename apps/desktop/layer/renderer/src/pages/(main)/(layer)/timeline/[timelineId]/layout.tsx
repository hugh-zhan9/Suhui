import { useCallback, useRef, useState } from "react"
import { Outlet, redirect } from "react-router"

import { getTimelineIdByView, parseView } from "~/hooks/biz/useRouteParams"
import { EntryColumn } from "~/modules/entry-column"

export const loader = ({
  params,
  request,
}: {
  params: { timelineId?: string }
  request: Request
}) => {
  const { timelineId } = params
  if (!timelineId) return null

  const view = parseView(timelineId)
  if (view === undefined) return null

  const canonicalTimelineId = getTimelineIdByView(view)

  if (canonicalTimelineId === timelineId) return null

  const url = new URL(request.url)
  const segments = url.pathname.split("/")
  const timelineIndex = segments.indexOf("timeline")

  if (timelineIndex !== -1 && segments[timelineIndex + 1]) {
    segments[timelineIndex + 1] = canonicalTimelineId
    const nextPathname = segments.join("/") || "/"
    const nextUrl = `${nextPathname}${url.search}${url.hash}`
    return redirect(nextUrl)
  }

  return redirect(`/timeline/${canonicalTimelineId}${url.search}${url.hash}`)
}

const DEFAULT_WIDTH = 356
const MIN_WIDTH = 220
const MAX_WIDTH = 560

export const Component = () => {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [collapsed, setCollapsed] = useState(false)

  // Track drag state with refs to avoid stale closures
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(DEFAULT_WIDTH)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only start drag on left mouse button
      if (e.button !== 0) return
      isDragging.current = true
      startX.current = e.clientX
      startWidth.current = collapsed ? 0 : width

      const onMouseMove = (e: MouseEvent) => {
        if (!isDragging.current) return
        const delta = e.clientX - startX.current
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta))
        setWidth(newWidth)
        if (collapsed && delta > 20) {
          setCollapsed(false)
        }
      }

      const onMouseUp = () => {
        isDragging.current = false
        window.removeEventListener("mousemove", onMouseMove)
        window.removeEventListener("mouseup", onMouseUp)
      }

      window.addEventListener("mousemove", onMouseMove)
      window.addEventListener("mouseup", onMouseUp)
      e.preventDefault()
    },
    [width, collapsed],
  )

  const toggleCollapse = useCallback(() => {
    setCollapsed((c) => !c)
  }, [])

  return (
    <div className="flex h-full w-full min-w-0">
      {/* Entry list column */}
      <div
        className="relative shrink-0 overflow-hidden transition-[width] duration-200"
        style={{ width: collapsed ? 0 : `${width}px` }}
      >
        <EntryColumn />
      </div>

      {/* Custom drag handle + collapse button */}
      <div className="group relative flex w-1 shrink-0 flex-col items-center">
        {/* Drag zone */}
        <div
          className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize"
          onMouseDown={onMouseDown}
        />

        {/* Collapse / expand toggle button */}
        <button
          type="button"
          title={collapsed ? "展开文章列表" : "折叠文章列表"}
          onClick={toggleCollapse}
          className="absolute top-1/2 z-10 -translate-y-1/2 flex h-8 w-4 -translate-x-0.5 items-center justify-center rounded-sm bg-fill-secondary opacity-0 shadow transition-opacity hover:bg-accent hover:text-accent-foreground group-hover:opacity-100"
        >
          <i
            className={`size-3 ${collapsed ? "i-mingcute-right-line" : "i-mingcute-left-line"}`}
          />
        </button>

        {/* Visual divider line */}
        <div className="mx-auto h-full w-px bg-border" />
      </div>

      {/* Entry content column */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
