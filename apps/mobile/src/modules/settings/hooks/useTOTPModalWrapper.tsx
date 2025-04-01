import { useCallback } from "react"

import { getFetchErrorInfo } from "@/src/lib/error-parser"
import { useNavigation } from "@/src/lib/navigation/hooks"
import { toast } from "@/src/lib/toast"
import { TwoFactorAuthScreen } from "@/src/screens/(modal)/2fa"
import { useWhoami } from "@/src/store/user/hooks"

export const useTOTPModalWrapper = <T extends { TOTPCode?: string }>(
  callback: (input: T) => Promise<any>,
  options?: { force?: boolean },
) => {
  const user = useWhoami()
  const navigation = useNavigation()
  return useCallback(
    async (input: T) => {
      const presentTOTPModal = () => {
        if (!user?.twoFactorEnabled) {
          toast.error("You need to enable two-factor authentication to perform this action.")

          navigation.pushControllerView(TwoFactorAuthScreen)

          return
        }

        // present({
        //   title: t("profile.totp_code.title"),
        //   content: ({ dismiss }) => {
        //     return createElement(TOTPForm, {
        //       async onSubmitMutationFn(values) {
        //         await callback({
        //           ...input,
        //           TOTPCode: values.code,
        //         })
        //         dismiss()
        //       },
        //     })
        //   },
        // })
      }

      if (options?.force) {
        presentTOTPModal()
        return
      }

      try {
        await callback(input)
      } catch (error) {
        const { code } = getFetchErrorInfo(error as Error)
        if (code === 4008) {
          presentTOTPModal()
        }
      }
    },
    [callback, navigation, options?.force, user?.twoFactorEnabled],
  )
}
