import { requireNativeView } from "expo"
import type { NativeSyntheticEvent, ViewProps } from "react-native"

export const TabBarPortalWrapper = requireNativeView<ViewProps>("TabBarPortal")

export const TabScreenWrapper = requireNativeView<ViewProps>("TabScreen")

export const TabBarRootWrapper = requireNativeView<
  {
    onTabIndexChange: (e: NativeSyntheticEvent<{ index: number }>) => void
    selectedIndex: number
  } & ViewProps
>("TabBarRoot")
