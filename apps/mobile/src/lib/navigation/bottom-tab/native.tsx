import type { NativeSyntheticEvent, ViewProps } from "react-native"
import { View } from "react-native"

export { View as TabBarPortalWrapper } from "react-native"
export { View as TabScreenWrapper } from "react-native"

export const TabBarRootWrapper = (
  props: {
    onTabIndexChange: (e: NativeSyntheticEvent<{ index: number }>) => void
    selectedIndex: number
  } & ViewProps,
) => {
  return <View {...props} />
}
