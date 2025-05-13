import { createContext, use, useImperativeHandle, useRef, useState } from "react"
import { useEventListener } from "usehooks-ts"

// const
const FocusableContext = createContext(false)
const FocusTargetRefContext = createContext<React.RefObject<HTMLElement | undefined>>(null!)
export const Focusable: Component<
  React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>
> = ({ ref, ...props }) => {
  const { onBlur, onFocus, ...rest } = props
  const [isFocusWithIn, setIsFocusWithIn] = useState(false)
  const focusTargetRef = useRef<HTMLElement | undefined>(void 0)

  const containerRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => containerRef.current!)
  useEventListener("focusin", (e) => {
    if (containerRef.current?.contains(e.target as Node)) {
      setIsFocusWithIn(true)
    } else {
      setIsFocusWithIn(false)
    }
  })

  // useEventListener("focusout", (e) => {
  //   if (!containerRef.current?.contains(e.target as Node)) {
  //     setIsFocusWithIn(false)
  //   }
  // })

  return (
    <FocusableContext value={isFocusWithIn}>
      <FocusTargetRefContext value={focusTargetRef}>
        <div tabIndex={-1} role="region" ref={containerRef} {...rest} />
      </FocusTargetRefContext>
    </FocusableContext>
  )
}

export const useFocusable = () => {
  return use(FocusableContext)
}

export const useFocusTargetRef = () => {
  return use(FocusTargetRefContext)
}
