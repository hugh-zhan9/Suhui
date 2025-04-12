import type {
  ImageErrorEventData,
  ImageLoadEventData,
  ImageProps as ExpoImageProps,
} from "expo-image"
import { Image as ExpoImage } from "expo-image"
import { forwardRef, useCallback, useMemo, useState } from "react"
import type { ViewStyle } from "react-native"
import { Text, View } from "react-native"
import { useColor } from "react-native-uikit-colors"

import { ErrorBoundary } from "@/src/components/common/ErrorBoundary"

import { getAllSources } from "./utils"

export type ImageProps = Omit<ExpoImageProps, "source"> & {
  proxy?: {
    width?: number
    height?: number
  }
  source?: {
    uri: string
    headers?: Record<string, string>
  }
  blurhash?: string
  aspectRatio?: number
}

export const Image = forwardRef<ExpoImage, ImageProps>(
  ({ proxy, source, blurhash, aspectRatio, ...rest }, ref) => {
    const [safeSource, proxiesSafeSource] = useMemo(
      () => getAllSources(source, proxy),
      [source, proxy],
    )

    const [isError, setIsError] = useState(false)
    const onError = useCallback(
      (e: ImageErrorEventData) => {
        if (isError) {
          rest.onError?.(e)
        } else {
          setIsError(true)
        }
      },
      [isError, rest],
    )

    const [isLoading, setIsLoading] = useState(true)
    const onLoad = useCallback(
      (e: ImageLoadEventData) => {
        setIsLoading(false)
        rest.onLoad?.(e)
      },
      [rest],
    )

    const backgroundColor = useColor("systemFill")

    if (!source?.uri) {
      return null
    }

    return (
      <ErrorBoundary
        fallbackRender={({ error }) => (
          <View
            style={{
              aspectRatio,
              ...(typeof rest.style === "object" && ({ ...rest.style } as ViewStyle)),
              backgroundColor,
            }}
          >
            <Text className="text-red text-center text-xs">{error.message}</Text>
          </View>
        )}
      >
        <ExpoImage
          recyclingKey={source?.uri}
          {...rest}
          source={isError ? safeSource : proxiesSafeSource}
          onError={onError}
          onLoad={onLoad}
          placeholder={{
            blurhash,
            ...(typeof rest.placeholder === "object" && { ...rest.placeholder }),
          }}
          style={{
            aspectRatio,
            ...(typeof rest.style === "object" && { ...rest.style }),
            ...(isLoading && { backgroundColor }),
          }}
          ref={ref}
        />
      </ErrorBoundary>
    )
  },
)
