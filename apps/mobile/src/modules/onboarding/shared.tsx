import { View } from "react-native"

import { useScaleHeight } from "@/src/lib/responsive"

export const OnboardingSectionScreenContainer = ({ children }: { children: React.ReactNode }) => {
  const height = useScaleHeight()(50)
  return (
    <View className="flex-1 items-center" style={{ marginTop: height }}>
      {children}
    </View>
  )
}
