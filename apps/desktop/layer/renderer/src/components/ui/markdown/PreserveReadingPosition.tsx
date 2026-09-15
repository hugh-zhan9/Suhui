import type { ReactNode } from "react"
import { Component } from "react"

type Props = {
  element: HTMLElement | null
  identity?: string
  revision: unknown
  children: ReactNode
}
type Snapshot = { scroller: HTMLElement; anchor: Element; top: number } | null

function scrollParent(element: HTMLElement): HTMLElement | null {
  let parent: Element | null = element
  while (parent) {
    if (
      parent instanceof HTMLElement &&
      /^(?:auto|scroll|overlay)$/.test(getComputedStyle(parent).overflowY) &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent
    }
    const root = parent.getRootNode()
    parent = parent.parentElement ?? (root instanceof ShadowRoot ? root.host : null)
  }
  return null
}

// Capture immediately before React changes the DOM, then compensate before paint.
// This also handles cache hits, without taking a stale snapshot while parsing.
export class PreserveReadingPosition extends Component<Props> {
  override getSnapshotBeforeUpdate(previous: Props): Snapshot {
    const { element, identity, revision } = this.props
    if (
      !element ||
      identity === undefined ||
      identity !== previous.identity ||
      revision === previous.revision
    )
      return null
    const scroller = scrollParent(element)
    if (!scroller || scroller.scrollTop === 0) return null
    const viewport = scroller.getBoundingClientRect()
    const anchors = element.querySelectorAll(
      "p,h1,h2,h3,h4,h5,h6,li,td,th,pre,figure,blockquote,div",
    )
    for (const anchor of anchors) {
      const rect = anchor.getBoundingClientRect()
      if (rect.height > 0 && rect.bottom > viewport.top && rect.top < viewport.bottom) {
        // Prefer the innermost block: a large wrapper may start far above the reader.
        if (
          [...anchor.querySelectorAll("p,li,pre,figure,div")].some((child) => {
            const childRect = child.getBoundingClientRect()
            return (
              childRect.height > 0 &&
              childRect.bottom > viewport.top &&
              childRect.top < viewport.bottom
            )
          })
        )
          continue
        return { scroller, anchor, top: rect.top }
      }
    }
    return null
  }

  override componentDidUpdate(_previous: Props, _state: unknown, snapshot: Snapshot) {
    if (!snapshot?.anchor.isConnected) return
    const delta = snapshot.anchor.getBoundingClientRect().top - snapshot.top
    // Native scroll anchoring may already have compensated; only apply the remainder.
    if (delta) snapshot.scroller.scrollTop += delta
  }

  override render() {
    return this.props.children
  }
}
