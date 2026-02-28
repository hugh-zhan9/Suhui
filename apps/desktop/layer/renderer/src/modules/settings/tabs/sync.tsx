import { Button } from "@follow/components/ui/button/index.js"
import { Input } from "@follow/components/ui/input/Input.js"
import { Label } from "@follow/components/ui/label/index.js"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { ipcServices } from "~/lib/client"
import { SettingActionItem, SettingDescription } from "../control"
import { SettingItemGroup } from "../section"

export const SettingSync = () => {
  const [repoPathInput, setRepoPathInput] = useState("")

  const { data: status, refetch } = useQuery({
    queryKey: ["sync", "status"],
    queryFn: async () => {
      const resp = await ipcServices?.sync?.getStatus?.()
      return resp as {
        deviceId: string
        syncRepoPath: string | null
        lastExportAt: number | null
        lastImportAt: number | null
      } | undefined
    },
    refetchOnMount: "always",
  })

  const handleUpdateRepo = async () => {
    if (!repoPathInput) return
    try {
      await ipcServices?.sync?.setSyncRepoPath?.(repoPathInput)
      toast.success("同步仓库路径已更新")
      setRepoPathInput("")
      refetch()
    } catch (e: any) {
      toast.error("更新失败：" + e.message)
    }
  }

  const handleGitSync = async () => {
    try {
      toast.info("正在执行全面同步...", { duration: 2000 })
      await ipcServices?.sync?.gitSync?.()
      toast.success("同步已完成！")
      refetch()
    } catch (e: any) {
      toast.error("同步失败：" + e.message)
    }
  }

  const handleCompactSnapshot = async () => {
    try {
      toast.info("正在创建快照...", { duration: 2000 })
      await ipcServices?.sync?.compactSnapshot?.()
      toast.success("全量快照导出成功！")
    } catch (e: any) {
      toast.error("快照导出失败：" + e.message)
    }
  }

  const handleImportSnapshot = async () => {
    try {
      toast.info("正在从快照导入初始化数据...", { duration: 2000 })
      await ipcServices?.sync?.importFromSnapshot?.()
      toast.success("快照初始化完成！")
      refetch()
    } catch (e: any) {
      toast.error("快照导入失败：" + e.message)
    }
  }

  return (
    <div className="mt-4">
      <SettingItemGroup>
        <div className="mb-4 text-lg font-bold">基本信息</div>
        <SettingDescription>设备 ID：{status?.deviceId || "加载中..."}</SettingDescription>
        <SettingDescription>
          当前仓库：{status?.syncRepoPath || "未配置，请在下方设置本地 Git 目录"}
        </SettingDescription>
        <SettingDescription>
          上次本地导出完成：{status?.lastExportAt ? new Date(status.lastExportAt).toLocaleString() : "从未导出"}
        </SettingDescription>
        <SettingDescription>
          上次远端导入完成：{status?.lastImportAt ? new Date(status.lastImportAt).toLocaleString() : "从未导入"}
        </SettingDescription>
      </SettingItemGroup>

      <SettingItemGroup>
        <div className="mt-6 mb-4 text-lg font-bold">仓库配置</div>
        <div className="flex w-full items-center space-x-2">
          <Input 
            placeholder="例如: /Users/username/sync-repo (需已 git init 并关联 remote)" 
            value={repoPathInput}
            onChange={e => setRepoPathInput(e.target.value)} 
            className="flex-1"
          />
          <Button onClick={() => void handleUpdateRepo()} disabled={!repoPathInput}>
            保存并应用
          </Button>
        </div>
        <SettingDescription className="mt-2">
          请指定一个空目录或已有 Git 同步仓库的路径。如果您尚未使用，系统默认在后台进行。
        </SettingDescription>
      </SettingItemGroup>

      <SettingItemGroup>
        <div className="mt-6 mb-4 text-lg font-bold">日常同步与维护</div>

        <SettingActionItem
          label={<span className="font-semibold text-blue-600">立即同步 (Git Pull & Push)</span>}
          action={() => void handleGitSync()}
          buttonText="拉取并推送"
        />
        <SettingDescription>
          这会导出您最新的本地阅读状态并将其 push 到远端，同时 pull 远端并将最新的 op 幂等于本地回放。每次重启与退出时也会自动执行。
        </SettingDescription>

        <div className="mt-4 border-t border-zinc-200 dark:border-zinc-800" />

        <div className="mt-4">
          <SettingActionItem
            label="快照工具 (初始化或存档)"
            action={() => void handleCompactSnapshot()}
            buttonText="创建 Base 快照"
          />
          <SettingDescription>将当前的收藏、订阅、已读状态进行一次全量导出，存储为 `snapshot/latest.json`。新设备可以先应用这个快照。该操作通常 3 个月执行一次即可。</SettingDescription>
        </div>

        <div className="mt-2">
          <SettingActionItem
            label=""
            action={() => void handleImportSnapshot()}
            buttonText="仅应用远端快照"
          />
          <SettingDescription>新设备启动时可以点击这个按钮去执行对拉取回来的 latest.json 进行全量覆盖与引入。（如果您已经用了一阵子，请勿轻易点击，可能会覆盖订阅更新）</SettingDescription>
        </div>
      </SettingItemGroup>
    </div>
  )
}
