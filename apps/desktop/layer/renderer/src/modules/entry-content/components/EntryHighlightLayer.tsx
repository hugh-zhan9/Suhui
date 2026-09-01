import { MemoedDangerousHTMLStyle } from "@suhui/components/common/MemoedDangerousHTMLStyle.js"
import { useEffect, useRef } from "react"

import type { LocatableHighlight } from "~/lib/highlight-range"
import { locateHighlightRanges } from "~/lib/highlight-range"

const ENTRY_HIGHLIGHT_NAME = "suhui-annotation"

// The article renders inside a shadow root that may opt out of the host styles, so the
// paint style travels with the layer instead of living in the global stylesheet.
const HIGHLIGHT_STYLE = `
::highlight(${ENTRY_HIGHLIGHT_NAME}) {
  background-color: rgb(250 204 21 / 0.4);
}

[data-theme="dark"] ::highlight(${ENTRY_HIGHLIGHT_NAME}) {
  background-color: rgb(250 204 21 / 0.28);
}
`

/**
 * Highlights are painted with the CSS Custom Highlight API so the article DOM that
 * React owns is never mutated. The registry is keyed per mounted layer because several
 * article bodies (for example a peek modal above the reader) can be visible at once,
 * while the browser keeps a single highlight registry per document.
 */
const paintedLayers = new Map<object, Range[]>()

const flushPaintedLayers = () => {
  if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") return

  const ranges = [...paintedLayers.values()].flat()
  if (ranges.length === 0) {
    CSS.highlights.delete(ENTRY_HIGHLIGHT_NAME)
    return
  }
  CSS.highlights.set(ENTRY_HIGHLIGHT_NAME, new Highlight(...ranges))
}

export function EntryHighlightLayer({ highlights }: { highlights: LocatableHighlight[] }) {
  const anchorRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return

    const root = anchor.getRootNode() as ParentNode
    if (typeof root.querySelector !== "function") return

    const token = {}
    let frame = 0

    const apply = () => {
      const article = root.querySelector("article")
      paintedLayers.set(token, article ? locateHighlightRanges(article, highlights) : [])
      flushPaintedLayers()
    }

    // The article renders asynchronously and re-renders on translation or readability
    // switches, so ranges are recomputed whenever its text changes.
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply)
    })
    observer.observe(root as Node, { childList: true, subtree: true, characterData: true })
    apply()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      paintedLayers.delete(token)
      flushPaintedLayers()
    }
  }, [highlights])

  return (
    <>
      <MemoedDangerousHTMLStyle>{HIGHLIGHT_STYLE}</MemoedDangerousHTMLStyle>
      <span ref={anchorRef} aria-hidden style={{ display: "none" }} />
    </>
  )
}
