import { Avatar, AvatarFallback, AvatarImage } from "@follow/components/ui/avatar/index.jsx"
import { TooltipContent, TooltipPortal } from "@follow/components/ui/tooltip/index.jsx"
import { FeedViewType } from "@follow/constants"
import { getNameInitials } from "@follow/utils/cjk"
import { m } from "motion/react"
import { memo } from "react"
import { useTranslation } from "react-i18next"

import { getRouteParams } from "~/hooks/biz/useRouteParams"
import { replaceImgUrlIfNeed } from "~/lib/img-proxy"
import { useUserById } from "~/store/user"

import { usePresentUserProfileModal } from "../../profile/hooks"

export const getLimit = (width: number): number => {
  const routeParams = getRouteParams()
  // social media view has four extra buttons
  if (
    [FeedViewType.SocialMedia, FeedViewType.Pictures, FeedViewType.Videos].includes(
      routeParams.view,
    )
  ) {
    if (width > 1100) return 15
    if (width > 950) return 10
    if (width > 800) return 5
    return 3
  }
  if (width > 900) return 15
  if (width > 600) return 10
  return 5
}

export const EntryUser: Component<{
  userId: string
  ref?: React.Ref<HTMLDivElement>
}> = memo(({ userId, ref }) => {
  const user = useUserById(userId)
  const { t } = useTranslation()
  const presentUserProfile = usePresentUserProfileModal("drawer")
  if (!user) return null
  return (
    <div className="no-drag-region relative cursor-pointer hover:!z-[99999]" ref={ref}>
      <m.button
        layout="position"
        layoutId={userId}
        type="button"
        onClick={() => {
          presentUserProfile(userId)
        }}
      >
        <Avatar className="border-border ring-background aspect-square size-7 border ring-1">
          <AvatarImage
            src={replaceImgUrlIfNeed(user?.image || undefined)}
            className="bg-material-ultra-thick"
          />
          <AvatarFallback>{getNameInitials(user.name || "")}</AvatarFallback>
        </Avatar>
      </m.button>
      <TooltipPortal>
        <TooltipContent side="top">
          {t("entry_actions.recent_reader")} {user.name}
        </TooltipContent>
      </TooltipPortal>
    </div>
  )
})
