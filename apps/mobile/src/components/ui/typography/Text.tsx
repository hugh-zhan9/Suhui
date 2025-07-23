import { cn } from "@follow/utils"
import type { FC } from "react"
import type { TextProps } from "react-native"
import { Text as RNText } from "react-native"

import { useUISettingKey } from "@/src/atoms/settings/ui"

export const Text: FC<TextProps> = (props) => {
  const systemFontScaling = useUISettingKey("useSystemFontScaling")

  return (
    <RNText
      {...props}
      className={cn("text-label text-base", props.className)}
      allowFontScaling={systemFontScaling}
    />
  )
}
