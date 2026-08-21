import type { SubscriptionWithFeed } from "@follow-app/client-sdk"
import { isMobile } from "@suhui/components/hooks/useMobile.js"
import { useFeedStore } from "@suhui/store/feed/store"
import { useSubscriptionStore } from "@suhui/store/subscription/store"
import { usePrefetchUser, useWhoami } from "@suhui/store/user/hooks"
import { capitalizeFirstLetter } from "@suhui/utils/utils"
import { createElement, lazy, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { parse } from "tldts"

import { useAsyncModal } from "~/components/ui/modal/helper/useAsyncModal"
import { PlainModal } from "~/components/ui/modal/stacked/custom-modal"
import { useModalStack } from "~/components/ui/modal/stacked/hooks"
import { getFetchErrorInfo } from "~/lib/error-parser"
import { toast } from "~/lib/toast"

import { TOTPForm, TwoFactorForm } from "./two-factor"

const LazyUserProfileModalContent = lazy(() =>
  import("./user-profile-modal").then((mod) => ({ default: mod.UserProfileModalContent })),
)

/**
 * 按分类分组的订阅列表。
 *
 * 本地版没有「别人的订阅」这回事——只有一个本地用户，所以数据直接取自本地
 * subscription/feed store（原实现打的是远端 `subscriptions.get({userId})`）。
 * 传入的 userId 不是本地用户时返回空，UI 自然什么都不显示。
 */
export const useUserSubscriptionsQuery = (userId: string | undefined) => {
  const me = useWhoami()
  const subscriptions = useSubscriptionStore((state) => state.data)
  const feeds = useFeedStore((state) => state.feeds)

  const data = useMemo(() => {
    if (!userId || !me?.id || userId !== me.id) return {}

    const groupFolder: Record<string, SubscriptionWithFeed[]> = {}
    for (const subscription of Object.values(subscriptions)) {
      if (!subscription?.feedId) continue
      const feed = feeds[subscription.feedId]
      if (!feed) continue

      let { category } = subscription
      if (!category && feed.siteUrl) {
        const parsed = parse(feed.siteUrl)
        if (parsed.domain) category = capitalizeFirstLetter(parsed.domain)
      }
      if (!category) continue

      groupFolder[category] ??= []
      // 本地 feed 模型与 SDK 的 SubscriptionWithFeed 字段同源，形状对得上
      groupFolder[category]!.push({
        ...subscription,
        feeds: feed,
      } as unknown as SubscriptionWithFeed)
    }
    return groupFolder
  }, [feeds, me?.id, subscriptions, userId])

  return { data, isLoading: false } as const
}

type Variant = "drawer" | "dialog"
export const usePresentUserProfileModal = (variant: Variant = "dialog") => {
  const { present } = useModalStack()
  const presentAsync = useAsyncModal()
  return useCallback(
    (userId: string | undefined, overrideVariant?: Variant) => {
      if (!userId) return
      const finalVariant = overrideVariant || variant

      if (isMobile()) {
        const useDataFetcher = () => {
          const user = usePrefetchUser(userId)
          const subscriptions = useUserSubscriptionsQuery(user?.data?.id)
          return {
            ...user,
            isLoading: user.isLoading || subscriptions.isLoading,
          }
        }
        type ResponseType = ReturnType<typeof useDataFetcher>["data"]
        return presentAsync<ResponseType>({
          id: `user-profile-${userId}`,
          title: (data: ResponseType) => `${data?.name}'s Profile`,

          content: () => createElement(LazyUserProfileModalContent, { userId }),
          useDataFetcher,
          overlay: true,
        })
      }

      present({
        title: "User Profile",
        id: `user-profile-${userId}`,
        content: () =>
          createElement(LazyUserProfileModalContent, {
            userId,
            variant: finalVariant,
          }),
        CustomModalComponent: PlainModal,
        clickOutsideToDismiss: true,
        modal: finalVariant === "dialog",
        overlay: finalVariant === "dialog",
        autoFocus: false,
        modalContainerClassName:
          finalVariant === "drawer"
            ? tw`right-4 left-[auto] safe-inset-top-4 bottom-4`
            : "overflow-hidden",
      })
    },
    [present, presentAsync, variant],
  )
}

export function useTOTPModalWrapper<T extends { TOTPCode?: string }>(
  callback: (input: T) => Promise<any>,
  options?: { force?: boolean },
) {
  const { present } = useModalStack()
  const { t } = useTranslation("settings")
  const user = useWhoami()
  return useCallback(
    async (input: T) => {
      const presentTOTPModal = () => {
        if (!user?.twoFactorEnabled) {
          toast.error(t("profile.two_factor.enable_notice"))
          present({
            title: t("profile.two_factor.enable"),
            content: TwoFactorForm,
          })
          return
        }

        present({
          title: t("profile.totp_code.title"),
          content: ({ dismiss }) => {
            return createElement(TOTPForm, {
              async onSubmitMutationFn(values) {
                await callback({
                  ...input,
                  TOTPCode: values.code,
                })
                dismiss()
              },
            })
          },
        })
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
    [callback, options?.force, present, t, user?.twoFactorEnabled],
  )
}
