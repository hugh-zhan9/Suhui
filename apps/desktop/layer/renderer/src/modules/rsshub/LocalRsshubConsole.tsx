import { Button, MotionButtonBase } from "@follow/components/ui/button/index.js"
import { Input } from "@follow/components/ui/input/Input.js"
import { Label } from "@follow/components/ui/label/index.jsx"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { ipcServices } from "~/lib/client"
import { queryClient } from "~/lib/query-client"
import { SettingDescription, SettingSwitch } from "~/modules/settings/control"
import { SettingItemGroup } from "~/modules/settings/section"
import {
  getLocalRsshubStatusLabel,
  normalizeLocalRsshubState,
} from "~/modules/settings/tabs/rsshub-local-state"

const localRsshubQueryKey = ["rsshub", "local", "status"] as const

type LocalRsshubIpc = {
  getRsshubStatus?: () => Promise<unknown>
  toggleRsshub?: (enabled: boolean) => Promise<unknown>
  restartRsshub?: () => Promise<unknown>
}
type LocalRsshubSettingIpc = {
  getRsshubAutoStart?: () => Promise<boolean>
  setRsshubAutoStart?: (enabled: boolean) => Promise<unknown>
  getRsshubCustomUrl?: () => Promise<string>
  setRsshubCustomUrl?: (url: string) => Promise<unknown>
  getRsshubRuntimeMode?: () => Promise<"lite" | "official">
  setRsshubRuntimeMode?: (mode: "lite" | "official") => Promise<unknown>
  getRsshubTwitterCookie?: () => Promise<string>
  setRsshubTwitterCookie?: (cookie: string) => Promise<unknown>
}

export const LocalRsshubConsole = ({ compact = false }: { compact?: boolean }) => {
  const localRsshubIpc = ipcServices?.db as unknown as LocalRsshubIpc | undefined
  const localRsshubSettingIpc = ipcServices?.setting as unknown as LocalRsshubSettingIpc | undefined

  const stateQuery = useQuery({
    queryKey: localRsshubQueryKey,
    queryFn: async () => {
      const data = await localRsshubIpc?.getRsshubStatus?.()
      if (data && typeof data === "object") {
        return normalizeLocalRsshubState(data)
      }
      return normalizeLocalRsshubState()
    },
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const status = (query.state.data as ReturnType<typeof normalizeLocalRsshubState> | undefined)
        ?.status
      if (status === "starting" || status === "cooldown") {
        return 1000
      }
      return 4000
    },
  })

  const autoStartQuery = useQuery({
    queryKey: ["rsshub", "local", "auto-start"],
    queryFn: async () => {
      return (await localRsshubSettingIpc?.getRsshubAutoStart?.()) ?? false
    },
    refetchOnMount: "always",
  })

  const customUrlQuery = useQuery({
    queryKey: ["rsshub", "local", "custom-url"],
    queryFn: async () => {
      return (await localRsshubSettingIpc?.getRsshubCustomUrl?.()) ?? ""
    },
    refetchOnMount: "always",
  })

  const runtimeModeQuery = useQuery({
    queryKey: ["rsshub", "local", "runtime-mode"],
    queryFn: async () => {
      return (await localRsshubSettingIpc?.getRsshubRuntimeMode?.()) ?? "lite"
    },
    refetchOnMount: "always",
  })

  const twitterCookieQuery = useQuery({
    queryKey: ["rsshub", "local", "twitter-cookie"],
    queryFn: async () => {
      return (await localRsshubSettingIpc?.getRsshubTwitterCookie?.()) ?? ""
    },
    refetchOnMount: "always",
  })

  const autoStartMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!localRsshubSettingIpc?.setRsshubAutoStart) {
        throw new Error("IPC_NOT_AVAILABLE")
      }
      await localRsshubSettingIpc.setRsshubAutoStart(enabled)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rsshub", "local", "auto-start"] })
    },
    onError: () => {
      toast.error("RSSHub 自动启动设置保存失败")
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!localRsshubIpc?.toggleRsshub) {
        throw new Error("IPC_NOT_AVAILABLE")
      }
      await localRsshubIpc.toggleRsshub(enabled)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: localRsshubQueryKey })
    },
    onError: () => {
      toast.error("RSSHub 开关操作失败")
    },
  })

  const restartMutation = useMutation({
    mutationFn: async () => {
      if (!localRsshubIpc?.restartRsshub) {
        throw new Error("IPC_NOT_AVAILABLE")
      }
      await localRsshubIpc.restartRsshub()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: localRsshubQueryKey })
    },
    onError: () => {
      toast.error("RSSHub 重启失败")
    },
  })

  const customUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      if (!localRsshubSettingIpc?.setRsshubCustomUrl) {
        throw new Error("IPC_NOT_AVAILABLE")
      }
      await localRsshubSettingIpc.setRsshubCustomUrl(url)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rsshub", "local", "custom-url"] })
      toast.success("自定义 RSSHub 地址已保存")
    },
    onError: () => {
      toast.error("保存自定义 RSSHub 地址失败")
    },
  })

  const runtimeModeMutation = useMutation({
    mutationFn: async (mode: "lite" | "official") => {
      if (!localRsshubSettingIpc?.setRsshubRuntimeMode) {
        throw new Error("IPC_NOT_AVAILABLE")
      }
      await localRsshubSettingIpc.setRsshubRuntimeMode(mode)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rsshub", "local", "runtime-mode"] }),
        queryClient.invalidateQueries({ queryKey: localRsshubQueryKey }),
      ])
      toast.success("RSSHub 运行模式已更新")
    },
    onError: () => {
      toast.error("更新 RSSHub 运行模式失败")
    },
  })

  const twitterCookieMutation = useMutation({
    mutationFn: async (cookie: string) => {
      if (!localRsshubSettingIpc?.setRsshubTwitterCookie) {
        throw new Error("IPC_NOT_AVAILABLE")
      }
      await localRsshubSettingIpc.setRsshubTwitterCookie(cookie)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rsshub", "local", "twitter-cookie"] })
      toast.success("Twitter 凭据已保存，重启内置 RSSHub 后生效")
    },
    onError: () => {
      toast.error("保存 Twitter 凭据失败")
    },
  })

  const state = normalizeLocalRsshubState(stateQuery.data)
  const isRunning = state.status === "running" || state.status === "starting"
  const busy = toggleMutation.isPending || restartMutation.isPending
  const autoStartBusy = autoStartMutation.isPending
  const autoStartEnabled = autoStartQuery.data ?? false
  const [customUrlInput, setCustomUrlInput] = useState("")
  const [twitterCookieInput, setTwitterCookieInput] = useState("")
  const runtimeMode = runtimeModeQuery.data ?? "lite"
  useEffect(() => {
    setCustomUrlInput(customUrlQuery.data ?? "")
  }, [customUrlQuery.data])
  useEffect(() => {
    setTwitterCookieInput(twitterCookieQuery.data ?? "")
  }, [twitterCookieQuery.data])

  return (
    <SettingItemGroup>
      <div className="mb-2 mt-4 flex items-center justify-between gap-4">
        <div className="text-sm font-medium">内置 RSSHub</div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => toggleMutation.mutate(!isRunning)}
          >
            {isRunning ? "停止" : "启动"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || state.status === "starting"}
            onClick={() => restartMutation.mutate()}
          >
            重启
          </Button>
        </div>
      </div>
      <SettingDescription>
        状态：{getLocalRsshubStatusLabel(state)}
        {state.retryCount > 0 ? `，失败重试次数：${state.retryCount}` : ""}
      </SettingDescription>
      <div className="mt-3 space-y-2">
        <Label className="text-xs text-text-secondary">运行模式</Label>
        <div className="flex items-center gap-2">
          <Button
            variant={runtimeMode === "lite" ? "primary" : "outline"}
            size="sm"
            disabled={runtimeModeMutation.isPending}
            onClick={() => runtimeModeMutation.mutate("lite")}
          >
            Lite
          </Button>
          <Button
            variant={runtimeMode === "official" ? "primary" : "outline"}
            size="sm"
            disabled={runtimeModeMutation.isPending}
            onClick={() => runtimeModeMutation.mutate("official")}
          >
            Official
          </Button>
        </div>
        <SettingDescription>
          Lite 为轻量内置路由；Official 为官方 RSSHub 全量模式（切换后自动重启内置服务）
        </SettingDescription>
        {runtimeMode === "lite" && (
          <div className="rounded-md border border-stroke bg-theme-background/40 p-3 text-xs">
            <div className="mb-2 font-medium text-text">
              Lite 模式支持路由（{state.liteSupportedRoutes.length}）
            </div>
            {state.liteSupportedRoutes.length > 0 ? (
              <div className="max-h-40 overflow-auto whitespace-pre-line text-text-secondary">
                {state.liteSupportedRoutes.join("\n")}
              </div>
            ) : (
              <div className="text-text-secondary">当前未读取到 Lite 路由清单</div>
            )}
          </div>
        )}
      </div>
      <SettingSwitch
        className="mt-3"
        label="启动应用时自动启动内置 RSSHub"
        checked={autoStartEnabled}
        disabled={autoStartBusy}
        onCheckedChange={(checked) => autoStartMutation.mutate(checked)}
      />
      {!compact && (
        <div className="mt-3 space-y-2">
          <Label className="text-xs text-text-secondary">自定义 RSSHub 实例（可选）</Label>
          <div className="flex items-center gap-2">
            <Input
              value={customUrlInput}
              placeholder="https://rsshub.example.com"
              onChange={(event) => setCustomUrlInput(event.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={customUrlMutation.isPending}
              onClick={() => customUrlMutation.mutate(customUrlInput)}
            >
              保存
            </Button>
          </div>
          <SettingDescription>命中该域名时将直连该实例，不走本地内置 RSSHub</SettingDescription>
        </div>
      )}
      {!compact && runtimeMode === "official" && (
        <div className="mt-3 space-y-2">
          <Label className="text-xs text-text-secondary">
            Twitter Cookie（可选，用于 /twitter/* 路由）
          </Label>
          <div className="flex items-center gap-2">
            <Input
              value={twitterCookieInput}
              placeholder="auth_token=...; ct0=..."
              onChange={(event) => setTwitterCookieInput(event.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={twitterCookieMutation.isPending}
              onClick={() => twitterCookieMutation.mutate(twitterCookieInput)}
            >
              保存
            </Button>
          </div>
          <SettingDescription>
            建议至少包含 auth_token 与 ct0。保存后点击“重启”使内置 RSSHub 读取新凭据。
          </SettingDescription>
        </div>
      )}
    </SettingItemGroup>
  )
}

export const LocalRsshubEntryButton = ({ onClick }: { onClick: () => void }) => {
  return (
    <MotionButtonBase
      type="button"
      className="text-button flex max-h-8 min-h-8 min-w-16 items-center justify-center rounded-full border px-3 py-1.5 text-sm transition-colors"
      onClick={onClick}
    >
      打开控制台
    </MotionButtonBase>
  )
}
