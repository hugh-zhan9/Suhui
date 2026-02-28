import { PhCloudCheck } from "@follow/components/icons/PhCloudCheck.js"
import { SettingSync } from "~/modules/settings/tabs/sync"
import { SettingsTitle } from "~/modules/settings/title"
import { defineSettingPageData } from "~/modules/settings/utils"

const priority = (1000 << 1) + 40 // 排在 DateControl 后面

export const loader = defineSettingPageData({
  icon: <PhCloudCheck />,
  name: "云端同步" as any,
  priority,
})

export function Component() {
  return (
    <>
      <SettingsTitle />
      <SettingSync />
    </>
  )
}
