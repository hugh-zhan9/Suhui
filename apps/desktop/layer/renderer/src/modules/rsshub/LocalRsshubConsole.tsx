import { Button } from "@follow/components/ui/button/index.js"
import { Input } from "@follow/components/ui/input/Input.js"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { ipcServices } from "~/lib/client"
import { queryClient } from "~/lib/query-client"
import { SettingDescription } from "~/modules/settings/control"
import { SettingItemGroup } from "~/modules/settings/section"

type ExternalRsshubSettingIpc = {
  getRsshubCustomUrl?: () => Promise<string>
  setRsshubCustomUrl?: (url: string) => Promise<void> | void
}

export const LocalRsshubConsole = ({ compact = false }: { compact?: boolean }) => {
  const settingIpc = ipcServices?.setting as ExternalRsshubSettingIpc | undefined
  const customUrlQuery = useQuery({
    queryKey: ["rsshub", "external", "custom-url"],
    queryFn: async () => (await settingIpc?.getRsshubCustomUrl?.()) ?? "",
    refetchOnMount: "always",
  })
  const [customUrl, setCustomUrl] = useState("")

  useEffect(() => {
    if (customUrlQuery.data != null) {
      setCustomUrl(customUrlQuery.data)
    }
  }, [customUrlQuery.data])

  const handleSave = async (url: string) => {
    if (!settingIpc?.setRsshubCustomUrl) {
      toast.error("当前环境不支持配置 RSSHub")
      return
    }
    await settingIpc.setRsshubCustomUrl(url)
    toast.success("外部 RSSHub 已更新")
    await queryClient.invalidateQueries({ queryKey: ["rsshub", "external", "custom-url"] })
  }

  return (
    <SettingItemGroup>
      <div className={compact ? "text-sm font-medium" : "my-2 text-sm font-medium"}>
        外部 RSSHub
      </div>
      <SettingDescription>配置自建 RSSHub 实例地址。</SettingDescription>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          type="url"
          placeholder="https://rsshub.example.com"
          value={customUrl}
          onChange={(event) => setCustomUrl(event.target.value)}
        />
        <Button variant="outline" onClick={() => void handleSave(customUrl)}>
          保存
        </Button>
        {!compact && (
          <Button variant="text" onClick={() => void handleSave("https://rsshub.app")}>
            使用官方默认
          </Button>
        )}
      </div>
    </SettingItemGroup>
  )
}
