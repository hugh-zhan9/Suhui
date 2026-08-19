import { useEffect, useRef, useState } from "react"

import { EntryAnnotationsPanel } from "./EntryAnnotationsPanel"

type IdleGlobal = typeof globalThis & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  cancelIdleCallback?: (handle: number) => void
}

export function DeferredEntryAnnotationsPanel({ entryId }: { entryId: string }) {
  const boundaryRef = useRef<HTMLDivElement>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const [shouldMount, setShouldMount] = useState(false)

  useEffect(() => {
    const boundary = boundaryRef.current
    if (!boundary) return
    setNearViewport(false)
    setShouldMount(false)

    if (typeof IntersectionObserver === "undefined") {
      setNearViewport(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setNearViewport(true)
        observer.disconnect()
      },
      { rootMargin: "800px 0px" },
    )
    observer.observe(boundary)
    return () => observer.disconnect()
  }, [entryId])

  useEffect(() => {
    if (!nearViewport) return
    const idleGlobal = globalThis as IdleGlobal
    if (idleGlobal.requestIdleCallback) {
      const handle = idleGlobal.requestIdleCallback(() => setShouldMount(true), { timeout: 1200 })
      return () => idleGlobal.cancelIdleCallback?.(handle)
    }

    const handle = setTimeout(() => setShouldMount(true), 0)
    return () => clearTimeout(handle)
  }, [entryId, nearViewport])

  return (
    <div ref={boundaryRef} className="min-h-px">
      {shouldMount ? <EntryAnnotationsPanel entryId={entryId} /> : null}
    </div>
  )
}
