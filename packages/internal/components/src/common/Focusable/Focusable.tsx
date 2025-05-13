import { useCallback, useImperativeHandle, useMemo, useRef, useState } from "react"
import { useEventListener } from "usehooks-ts"

import { FocusableContext, FocusActionsContext, FocusTargetRefContext } from "./context"
import { highlightElement } from "./utils"

export const Focusable: Component<
  React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>
> = ({ ref, ...props }) => {
  const { onBlur, onFocus, ...rest } = props
  const [isFocusWithIn, setIsFocusWithIn] = useState(false)
  const focusTargetRef = useRef<HTMLElement | undefined>(void 0)

  const containerRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => containerRef.current!)

  const highlightBoundary = useCallback(() => {
    if (!isFocusWithIn) return
    const element = containerRef.current
    if (!element) return

    highlightElement(element)
  }, [isFocusWithIn])

  useEventListener("focusin", (e) => {
    if (containerRef.current?.contains(e.target as Node)) {
      setIsFocusWithIn(true)
      focusTargetRef.current = e.target as HTMLElement
      if (import.meta.env.DEV) {
        highlightElement(containerRef.current!)
      }
    } else {
      setIsFocusWithIn(false)
      focusTargetRef.current = undefined
    }
  })

  return (
    <FocusableContext value={isFocusWithIn}>
      <FocusTargetRefContext value={focusTargetRef}>
        <FocusActionsContext value={useMemo(() => ({ highlightBoundary }), [highlightBoundary])}>
          <div tabIndex={-1} role="region" ref={containerRef} {...rest} />
        </FocusActionsContext>
      </FocusTargetRefContext>
    </FocusableContext>
  )
}
