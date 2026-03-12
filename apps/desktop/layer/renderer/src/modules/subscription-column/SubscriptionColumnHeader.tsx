import { ActionButton } from "@suhui/components/ui/button/index.js"
import { stopPropagation } from "@suhui/utils/dom"
import { cn } from "@suhui/utils/utils"
import { m } from "motion/react"
import { memo, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"

import { setTimelineColumnShow, useSubscriptionColumnShow } from "~/atoms/sidebar"
import { useBackHome } from "~/hooks/biz/useNavigateEntry"
import { useRouteParamsSelector } from "~/hooks/biz/useRouteParams"
import { useI18n } from "~/hooks/common"
import { ProfileButton } from "~/modules/user/ProfileButton"

const APP_ICON_SRC = "icon.png?v=20260303"

export const SubscriptionColumnHeader = memo(() => {
  const timelineId = useRouteParamsSelector((s) => s.timelineId)
  const navigateBackHome = useBackHome(timelineId)
  const normalStyle = !window.electron || window.electron.process.platform !== "darwin"
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        "ml-5 mr-3 flex items-center",

        normalStyle ? "ml-4 justify-between" : "justify-end",
      )}
    >
      {normalStyle && (
        <div
          className="relative flex items-center gap-2 text-base font-semibold"
          onClick={(e) => {
            e.stopPropagation()
            navigateBackHome()
          }}
        >
          <img
            src={APP_ICON_SRC}
            alt="溯洄图标"
            className="size-6 rounded-md"
            onError={(event) => {
              event.currentTarget.src = "icon.svg"
            }}
          />
          <span className="leading-none">溯洄 (SuHui)</span>
        </div>
      )}
      <div className="relative flex items-center gap-2" onClick={stopPropagation}>
        <Link to="/discover" tabIndex={-1}>
          <ActionButton shortcut="$mod+T" tooltip={t("words.discover")}>
            <i className="i-mgc-add-cute-re size-5 text-text-secondary" />
          </ActionButton>
        </Link>

        <ProfileButton method="modal" animatedAvatar />
        <LayoutActionButton />
      </div>
    </div>
  )
})

const LayoutActionButton = () => {
  const feedColumnShow = useSubscriptionColumnShow()

  const [animation, setAnimation] = useState({ width: !feedColumnShow ? "auto" : 0 })
  useEffect(() => {
    setAnimation({ width: !feedColumnShow ? "auto" : 0 })
  }, [feedColumnShow])

  const t = useI18n()

  if (feedColumnShow) return null

  return (
    <m.div initial={animation} animate={animation} className="overflow-hidden">
      <ActionButton
        tooltip={t("app.toggle_sidebar")}
        icon={
          <i
            className={cn(
              !feedColumnShow
                ? "i-mgc-layout-leftbar-open-cute-re"
                : "i-mgc-layout-leftbar-close-cute-re",
              "text-text-secondary",
            )}
          />
        }
        onClick={() => {
          setTimelineColumnShow(!feedColumnShow)
        }}
      />
    </m.div>
  )
}
