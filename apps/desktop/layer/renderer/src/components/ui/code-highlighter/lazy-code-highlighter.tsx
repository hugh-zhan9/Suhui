import type { ComponentType } from "react"
import { createElement, useEffect, useState } from "react"

import type { ShikiProps } from "./shiki/Shiki"

export type LazyCodeHighlighterProps = Pick<
  ShikiProps,
  "className" | "code" | "language" | "showCopy"
>

type Highlighter = ComponentType<LazyCodeHighlighterProps>
type HighlighterLoader = () => Promise<Highlighter>

const PlainCode = ({ code, language, className }: LazyCodeHighlighterProps) => (
  <pre className={className}>
    <code className={language ? `language-${language}` : undefined}>{code}</code>
  </pre>
)

export const createLazyCodeHighlighter = (loadHighlighter: HighlighterLoader) => {
  return function LazyCodeHighlighter(props: LazyCodeHighlighterProps) {
    const [Highlighter, setHighlighter] = useState<Highlighter | null>(null)

    useEffect(() => {
      let mounted = true
      void loadHighlighter()
        .then((loaded) => {
          if (mounted) setHighlighter(() => loaded)
        })
        .catch(() => {
          // The semantic fallback remains the source of truth when enhancement fails.
        })
      return () => {
        mounted = false
      }
    }, [])

    return Highlighter ? createElement(Highlighter, props) : <PlainCode {...props} />
  }
}

export const LazyCodeHighlighter = createLazyCodeHighlighter(() =>
  import("./shiki/Shiki").then((module) => module.ShikiHighLighter),
)
