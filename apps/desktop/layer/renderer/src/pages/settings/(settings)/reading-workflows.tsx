import { SettingReadingWorkflows } from "~/modules/settings/tabs/reading-workflows"
import { SettingsTitle } from "~/modules/settings/title"
import { defineSettingPageData } from "~/modules/settings/utils"

export const loader = defineSettingPageData({
  icon: "i-mgc-task-2-cute-re",
  name: "阅读工作流" as any,
  priority: (1000 << 1) + 35,
})

export function Component() {
  return (
    <>
      <SettingsTitle />
      <SettingReadingWorkflows />
    </>
  )
}
