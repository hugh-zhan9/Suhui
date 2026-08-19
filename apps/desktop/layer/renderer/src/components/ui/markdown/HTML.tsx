import { MemoedDangerousHTMLStyle } from "@suhui/components/common/MemoedDangerousHTMLStyle.js"
import type { Root } from "hast"
import katexStyle from "katex/dist/katex.min.css?raw"
import {
  createElement,
  Fragment,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import type { JSX } from "react/jsx-runtime"

import { ENTRY_CONTENT_RENDER_CONTAINER_ID } from "~/constants/dom"
import { htmlParserClient } from "~/lib/html-parser-client"
import { renderHtmlTree } from "~/lib/parse-html"
import { useWrappedElementSize } from "~/providers/wrapped-element-provider"

import { MediaContainerWidthProvider } from "../media/MediaContainerWidthProvider"
import type { MediaInfoRecord } from "../media/MediaInfoRecord"
import { MediaInfoRecordProvider } from "../media/MediaInfoRecordProvider"
import { MarkdownRenderContainerRefContext } from "./context"

export type HTMLProps<A extends keyof JSX.IntrinsicElements = "div"> = {
  children: string | null | undefined
  as: A

  accessory?: React.ReactNode
  noMedia?: boolean
  mediaInfo?: Nullable<MediaInfoRecord>
} & JSX.IntrinsicElements[A] &
  Partial<{
    renderInlineStyle: boolean
  }>
const HTMLImpl = <A extends keyof JSX.IntrinsicElements = "div">(props: HTMLProps<A>) => {
  const {
    children,
    renderInlineStyle,
    as = "div",
    accessory,
    noMedia,
    mediaInfo,
    ref,
    ...rest
  } = props
  const [shouldForceReMountKey, setShouldForceReMountKey] = useState(0)
  const previousOptionsRef = useRef({ renderInlineStyle, noMedia })

  useEffect(() => {
    const previous = previousOptionsRef.current
    if (previous.renderInlineStyle === renderInlineStyle && previous.noMedia === noMedia) return
    previousOptionsRef.current = { renderInlineStyle, noMedia }
    setShouldForceReMountKey((key) => key + 1)
  }, [renderInlineStyle, noMedia])

  const [refElement, setRefElement] = useState<HTMLElement | null>(null)
  useImperativeHandle(ref as any, () => refElement)

  const parserOptions = useMemo(
    () => ({ renderInlineStyle, noMedia }),
    [renderInlineStyle, noMedia],
  )
  const [parsed, setParsed] = useState<{
    content: string
    options: typeof parserOptions
    tree: Root
  } | null>(null)
  const [parseError, setParseError] = useState<Error | null>(null)

  useEffect(() => {
    if (!children) {
      setParsed(null)
      setParseError(null)
      return
    }

    let cancelled = false
    setParseError(null)
    void htmlParserClient.parse(children, parserOptions).then(
      (tree) => {
        if (!cancelled) setParsed({ content: children, options: parserOptions, tree })
      },
      (error) => {
        if (!cancelled) {
          setParseError(error instanceof Error ? error : new Error(String(error)))
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [children, parserOptions])

  const parsedMatchesCurrentContent =
    !!children &&
    parsed?.content === children &&
    parsed.options.renderInlineStyle === parserOptions.renderInlineStyle &&
    parsed.options.noMedia === parserOptions.noMedia
  const hastTree = children
    ? parsedMatchesCurrentContent
      ? parsed.tree
      : htmlParserClient.getCached(children, parserOptions)
    : undefined
  const markdownElement = useMemo(() => hastTree && renderHtmlTree(hastTree), [hastTree])

  const { w: containerWidth } = useWrappedElementSize()

  if (parseError) throw parseError
  if (!markdownElement) return null
  return (
    <MarkdownRenderContainerRefContext value={refElement}>
      <MediaContainerWidthProvider width={containerWidth}>
        <MediaInfoRecordProvider mediaInfo={mediaInfo}>
          <MemoedDangerousHTMLStyle>{katexStyle}</MemoedDangerousHTMLStyle>
          {createElement(
            as,
            {
              ...rest,
              id: ENTRY_CONTENT_RENDER_CONTAINER_ID,
              ref: setRefElement,
            },
            markdownElement,
          )}
        </MediaInfoRecordProvider>
      </MediaContainerWidthProvider>
      {!!accessory && <Fragment key={shouldForceReMountKey}>{accessory}</Fragment>}
    </MarkdownRenderContainerRefContext>
  )
}

export const HTML = memo(HTMLImpl)
