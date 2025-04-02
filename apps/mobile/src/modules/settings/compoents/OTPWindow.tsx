import { useMutation } from "@tanstack/react-query"
import type { FC } from "react"
import { useEffect, useRef, useState } from "react"
import { Keyboard, Modal, StyleSheet, Text, useWindowDimensions, View } from "react-native"
import type { OtpInputRef } from "react-native-otp-entry"
import { OtpInput } from "react-native-otp-entry"
import Animated, { FadeIn, FadeOut, useSharedValue, withSpring } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useColor } from "react-native-uikit-colors"

import { isAuthCodeValid, twoFactor } from "@/src/lib/auth"
import { toast } from "@/src/lib/toast"
import { accentColor } from "@/src/theme/colors"

export const OTPWindow: FC<{
  onSuccess: (token: string) => void
}> = ({ onSuccess }) => {
  const otpInputRef = useRef<OtpInputRef>(null)
  const label = useColor("label")
  const tertiaryLabel = useColor("tertiaryLabel")
  const secondaryBackground = useColor("gray5")
  const tertiaryBackground = useColor("gray6")

  const submitMutation = useMutation({
    onError(error) {
      toast.error(`Failed to verify: ${error.message}`)
    },
    onSuccess(data) {
      onSuccess(data.token)
    },
    onSettled() {
      setOpen(false)
    },
    mutationFn: async ({ code }: { code: string }) => {
      const { data, error } = await twoFactor.verifyTotp({ code })
      if (!data || error) {
        const errorMessage = error?.message ?? "Invalid TOTP code"
        toast.error(errorMessage)
        throw new Error(errorMessage)
      }

      return data
    },
  })

  const windowScaleValue = useSharedValue(0.9)
  const windowOpacityValue = useSharedValue(0)

  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(true)
  }, [])

  useEffect(() => {
    if (open) {
      windowScaleValue.value = withSpring(1, { stiffness: 100, damping: 10 })
      windowOpacityValue.value = withSpring(1, { stiffness: 100, damping: 10 })
    } else {
      windowOpacityValue.value = withSpring(0, { stiffness: 100, damping: 10 })
      windowScaleValue.value = withSpring(0.9, { stiffness: 100, damping: 10 })
    }
  }, [open, windowOpacityValue, windowScaleValue])

  const { height } = useWindowDimensions()

  const insets = useSafeAreaInsets()
  const [nextHeight, setNextHeight] = useState(height - insets.top)
  useEffect(() => {
    const sub = [
      Keyboard.addListener("keyboardDidShow", () => {
        const metrics = Keyboard.metrics()

        if (!metrics) return
        setNextHeight(height - metrics.height)
      }),
      Keyboard.addListener("keyboardWillHide", () => {
        setNextHeight(height - insets.top)
      }),
    ]
    return () => sub.forEach((listener) => listener.remove())
  }, [height, insets.top])

  return (
    <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
      <Animated.View exiting={FadeOut} entering={FadeIn} style={StyleSheet.absoluteFillObject}>
        <View className={"flex-1 bg-black/50"} />
      </Animated.View>
      <View className={"flex-1"}>
        {/* Window */}

        <View style={{ height: nextHeight }} className="pt-safe items-center justify-center">
          <Animated.View
            className="bg-system-background mx-5 overflow-hidden rounded-3xl"
            style={[
              styles.window,
              {
                transform: [{ scale: windowScaleValue }],
                opacity: windowOpacityValue,
              },
            ]}
          >
            <View className="px-6 pb-1 pt-6">
              <Text className="text-label mb-1 text-center text-lg font-medium">
                Verification Required
              </Text>
              <Text className="text-secondary-label text-center text-base">
                Please enter the code from your authenticator app.
              </Text>
            </View>

            <View className="px-4 py-5">
              <OtpInput
                disabled={submitMutation.isPending}
                ref={otpInputRef}
                numberOfDigits={6}
                autoFocus
                focusColor={"#00000000"}
                theme={{
                  containerStyle: { marginVertical: 8 },
                  pinCodeTextStyle: {
                    color: label,
                    fontSize: 22,
                    fontWeight: "500",
                  },
                  placeholderTextStyle: { color: tertiaryLabel },
                  filledPinCodeContainerStyle: {
                    borderColor: "transparent",
                    backgroundColor: secondaryBackground,
                  },
                  pinCodeContainerStyle: {
                    borderColor: "transparent",
                    backgroundColor: tertiaryBackground,
                    borderRadius: 12,
                    aspectRatio: 1,
                    width: 45,
                    marginHorizontal: 4,
                  },
                  focusedPinCodeContainerStyle: {
                    borderColor: accentColor,
                    borderWidth: 2,
                  },
                }}
                onFilled={(code) => {
                  if (isAuthCodeValid(code)) {
                    submitMutation.mutate({ code })
                  }
                }}
              />
            </View>

            <View className="border-non-opaque-separator border-t-hairline flex-row px-4 py-2">
              <View className="flex-1 items-center">
                <Text
                  className="text-accent px-5 py-2 text-base font-medium"
                  onPress={() => {
                    setOpen(false)
                  }}
                  suppressHighlighting
                >
                  Cancel
                </Text>
              </View>
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  window: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
    maxWidth: 400,
  },
})
