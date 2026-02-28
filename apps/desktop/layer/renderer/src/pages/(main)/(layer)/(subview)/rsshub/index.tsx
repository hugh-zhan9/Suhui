import { RSSHubLogo } from "@follow/components/ui/platform-icon/icons.js"

import { useSubViewTitle } from "~/modules/app-layout/subview/hooks"
import { LocalRsshubConsole } from "~/modules/rsshub/LocalRsshubConsole"

export function Component() {
  useSubViewTitle("words.rsshub")

  return (
    <div className="flex size-full flex-col px-6 py-8">
      <div className="mx-auto mb-6 max-w-6xl text-center">
        <div className="mb-4 flex justify-center">
          <RSSHubLogo className="size-16" />
        </div>
        <h1 className="mb-3 text-3xl font-bold text-text">RSSHub</h1>
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-text-secondary">
          这是 FreeFolo 的本地 RSSHub 控制台。你可以在这里管理内置 RSSHub 的启动状态、运行模式与路由能力。
        </p>
      </div>
      <div className="mx-auto w-full max-w-4xl">
        <LocalRsshubConsole />
      </div>
    </div>
  )
}
