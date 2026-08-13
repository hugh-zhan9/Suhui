/**
 * Simple text selection utilities for ShadowDOM
 */

export interface SelectionRect {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}

export interface TextSelectionEvent {
  selectedText: string
  startOffset?: number
  endOffset?: number
  prefix?: string
  suffix?: string
  timestamp: number
  rect: SelectionRect
}

/**
 * Add text selection listener to ShadowDOM container
 */
export function addTextSelectionListener(
  shadowRoot: ShadowRoot,
  onTextSelect: (event: TextSelectionEvent) => void,
  onSelectionClear?: () => void,
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const handleSelectionChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer)

    debounceTimer = setTimeout(() => {
      const selection = (shadowRoot as unknown as Document).getSelection?.()
      if (!selection) return

      // Check if selection is within our shadow root
      try {
        const range = selection.getRangeAt(0)
        if (!shadowRoot.contains(range.commonAncestorContainer)) return

        if (!selection.isCollapsed) {
          const selectedText = selection.toString().trim()
          if (selectedText) {
            const offsets = getArticleTextOffsets(shadowRoot, range, selectedText)
            onTextSelect({
              selectedText,
              ...offsets,
              timestamp: Date.now(),
              rect: normalizeRect(range.getBoundingClientRect()),
            })
          }
          return
        }
      } catch {
        // Uncaught IndexSizeError: Failed to execute 'getRangeAt' on 'Selection': 0 is not a valid index.
        return
      }
      onSelectionClear?.()
    }, 200)
  }

  document.addEventListener("selectionchange", handleSelectionChange)

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    document.removeEventListener("selectionchange", handleSelectionChange)
  }
}

function getArticleTextOffsets(shadowRoot: ShadowRoot, range: Range, selectedText: string) {
  const article = shadowRoot.querySelector("article")
  if (
    !article ||
    !article.contains(range.startContainer) ||
    !article.contains(range.endContainer)
  ) {
    return {}
  }
  try {
    const prefixRange = range.cloneRange()
    prefixRange.selectNodeContents(article)
    prefixRange.setEnd(range.startContainer, range.startOffset)
    const rawSelection = range.toString()
    const rawStart = prefixRange.toString().length + rawSelection.indexOf(selectedText)
    const suffixRange = range.cloneRange()
    suffixRange.selectNodeContents(article)
    suffixRange.setStart(range.endContainer, range.endOffset)
    return rawStart < 0
      ? {}
      : {
          startOffset: rawStart,
          endOffset: rawStart + selectedText.length,
          prefix: prefixRange.toString().slice(-64),
          suffix: suffixRange.toString().slice(0, 64),
        }
  } catch {
    return {}
  }
}

function normalizeRect(rect: DOMRect | DOMRectReadOnly): SelectionRect {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}
