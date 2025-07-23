import { cssInterop } from "nativewind"
import type { FC } from "react"
import type { TextProps } from "react-native"
import { StyleSheet, Text as RNText } from "react-native"

export const Text: FC<TextProps> = (props) => {
  return <RNText {...props} style={StyleSheet.flatten([styles.text, props.style])} />
}
cssInterop(Text, {
  className: "style",
})
const styles = {
  text: {
    fontSize: 16,
    lineHeight: 20,
  },
}
