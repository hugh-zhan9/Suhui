import type * as React from "react"
import type { ViewProps } from "react-native"

export const NativeWebView: React.ComponentType<
  ViewProps & {
    onContentHeightChange?: (e: { nativeEvent: { height: number } }) => void
    url?: string
  }
> = () => {
  console.warn("NativeWebView is not implemented on this platform")
  return null
}
