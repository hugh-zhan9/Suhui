import { CarbonInfinitySymbol } from "@suhui/components/icons/infinify.jsx"
import { Button, MotionButtonBase } from "@suhui/components/ui/button/index.js"
import { Input } from "@suhui/components/ui/input/Input.js"
import { Label } from "@suhui/components/ui/label/index.jsx"
import { Slider } from "@suhui/components/ui/slider/index.js"
import { ELECTRON_BUILD } from "@suhui/shared/constants"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { setGeneralSetting, useGeneralSettingValue } from "~/atoms/settings/general"
import { useDialog } from "~/components/ui/modal/stacked/hooks"
import { ipcServices } from "~/lib/client"
import { queryClient } from "~/lib/query-client"
import { clearLocalPersistStoreData } from "~/store/utils/clear"

import { SettingActionItem, SettingDescription } from "../control"
import { createSetting } from "../helper/builder"
import { SettingItemGroup } from "../section"

const { SettingBuilder } = createSetting("general", useGeneralSettingValue, setGeneralSetting)
type LocalReadingIpc = {
  exportBackup(path: string, rendererSettings?: Record<string, string>): Promise<unknown>
  prepareReplaceBackup(path: string): Promise<{ token: string }>
  restoreBackup(input: {
    path: string
    mode: "merge" | "replace"
    confirmationToken?: string
    rendererSettings?: Record<string, string>
  }): Promise<{ rendererSettings?: Record<string, string> }>
  acknowledgeRendererSettings(): Promise<void>
  exportOpmlFile(path: string): Promise<unknown>
  previewOpmlFile(path: string): Promise<OpmlPreviewItem[]>
  importOpmlFile(input: { path: string; selectedIndexes?: number[] }): Promise<unknown>
}

type OpmlPreviewItem = {
  index: number
  url: string
  title: string | null
  category: string | null
  duplicate: boolean
}

type FileDialogIpc = {
  showOpenFileDialog(input?: {
    filters?: Array<{ name: string; extensions: string[] }>
  }): Promise<string | null>
  showSaveFileDialog(input: {
    defaultPath: string
    filters?: Array<{ name: string; extensions: string[] }>
  }): Promise<string | null>
}
type ExternalRsshubIpc = {
  getRsshubCustomUrl?: () => Promise<string>
  setRsshubCustomUrl?: (url: string) => Promise<void> | void
}

export const SettingDataControl = () => {
  const { t } = useTranslation("settings")
  const { ask } = useDialog()

  return (
    <div className="mt-4">
      {/* Top Level - Most Important */}
      <SettingBuilder
        settings={[
          {
            type: "title",
            value: t("general.data"),
          },

          {
            type: "title",
            value: t("general.export_data.title"),
          },

          {
            type: "title",
            value: t("general.maintenance.title"),
          },
          ELECTRON_BUILD ? CleanElectronCache : CleanCacheStorage,
          ELECTRON_BUILD && AppCacheLimit,
          ELECTRON_BUILD && ExternalRsshubSection,
          {
            label: t("general.rebuild_database.label"),
            action: () => {
              ask({
                title: t("general.rebuild_database.title"),
                variant: "danger",
                message: `${t("general.rebuild_database.warning.line1")}\n${t("general.rebuild_database.warning.line2")}`,
                confirmText: t("ok", { ns: "common" }),
                onConfirm: async () => {
                  await clearLocalPersistStoreData()
                  window.location.reload()
                },
              })
            },
            description: t("general.rebuild_database.description"),
            buttonText: t("general.rebuild_database.button"),
          },
          ELECTRON_BUILD && {
            label: t("general.log_file.label"),
            description: t("general.log_file.description"),
            buttonText: t("general.log_file.button"),
            action: () => {
              ipcServices?.app.revealLogFile?.()
            },
          },
        ]}
      />
      {ELECTRON_BUILD && <LocalReadingDataTools />}
    </div>
  )
}

const LocalReadingDataTools = () => {
  const localReading = (ipcServices as unknown as { localReading?: LocalReadingIpc })?.localReading
  const app = ipcServices?.app as unknown as FileDialogIpc | undefined
  const [opmlImportPath, setOpmlImportPath] = useState<string | null>(null)
  const [opmlPreview, setOpmlPreview] = useState<OpmlPreviewItem[]>([])
  const [selectedOpmlIndexes, setSelectedOpmlIndexes] = useState<number[]>([])

  // AI/integration settings may contain secrets. The complete local-data backup
  // includes behavior and presentation settings but deliberately excludes those
  // credential-bearing namespaces.
  const captureRendererSettings = () =>
    Object.fromEntries(
      ["follow:general", "follow:ui"].flatMap((key) => {
        const value = window.localStorage.getItem(key)
        return value === null ? [] : [[key, value]]
      }),
    )

  const applyRendererSettings = async (settings?: Record<string, string>) => {
    if (!settings) return
    for (const [key, value] of Object.entries(settings)) {
      if (key === "follow:general" || key === "follow:ui") window.localStorage.setItem(key, value)
    }
    await localReading?.acknowledgeRendererSettings()
  }

  const exportBackup = async () => {
    const path = await app?.showSaveFileDialog({
      defaultPath: `suhui-${new Date().toISOString().slice(0, 10)}.suhui-backup`,
      filters: [{ name: "Suhui Backup", extensions: ["suhui-backup"] }],
    })
    if (!path) return
    await localReading?.exportBackup(path, captureRendererSettings())
    toast.success("完整备份已导出")
  }

  const restoreBackup = async (mode: "merge" | "replace") => {
    const path = await app?.showOpenFileDialog({
      filters: [{ name: "Suhui Backup", extensions: ["suhui-backup"] }],
    })
    if (!path) return
    if (mode === "replace") {
      const confirmed = window.confirm(
        "完整替换会先自动创建安全快照，再用备份内容替换当前数据。确认继续？",
      )
      if (!confirmed) return
      const prepared = await localReading?.prepareReplaceBackup(path)
      if (!prepared) return
      const secondConfirmed = window.confirm("请再次确认完整替换。失败时数据库事务会回滚。")
      if (!secondConfirmed) return
      const result = await localReading?.restoreBackup({
        path,
        mode,
        confirmationToken: prepared.token,
        rendererSettings: captureRendererSettings(),
      })
      await applyRendererSettings(result?.rendererSettings)
    } else {
      const result = await localReading?.restoreBackup({
        path,
        mode,
        rendererSettings: captureRendererSettings(),
      })
      await applyRendererSettings(result?.rendererSettings)
    }
    toast.success(mode === "merge" ? "备份已合并恢复" : "备份已完整恢复")
    window.location.reload()
  }

  const exportOpml = async () => {
    const path = await app?.showSaveFileDialog({
      defaultPath: "suhui.opml",
      filters: [{ name: "OPML", extensions: ["opml", "xml"] }],
    })
    if (!path) return
    await localReading?.exportOpmlFile(path)
    toast.success("OPML 已导出")
  }

  const importOpml = async () => {
    if (!opmlImportPath) return
    await localReading?.importOpmlFile({
      path: opmlImportPath,
      selectedIndexes: selectedOpmlIndexes,
    })
    toast.success("OPML 导入完成；重复订阅已跳过")
    window.location.reload()
  }

  const previewOpml = async () => {
    const path = await app?.showOpenFileDialog({
      filters: [{ name: "OPML", extensions: ["opml", "xml"] }],
    })
    if (!path) return
    const preview = (await localReading?.previewOpmlFile(path)) ?? []
    setOpmlImportPath(path)
    setOpmlPreview(preview)
    setSelectedOpmlIndexes(preview.filter((item) => !item.duplicate).map((item) => item.index))
  }

  return (
    <SettingItemGroup>
      <div className="mb-2 mt-4 text-sm font-medium">本地备份与 OPML</div>
      <SettingDescription>
        完整备份包含文章正文、状态、规则、标签、笔记、高亮和阅读队列；OPML 只交换订阅与分类。
      </SettingDescription>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void exportBackup()}>
          导出完整备份
        </Button>
        <Button variant="outline" onClick={() => void restoreBackup("merge")}>
          合并恢复
        </Button>
        <Button variant="outline" onClick={() => void restoreBackup("replace")}>
          完整替换恢复
        </Button>
        <Button variant="outline" onClick={() => void exportOpml()}>
          导出 OPML
        </Button>
        <Button variant="outline" onClick={() => void previewOpml()}>
          导入 OPML
        </Button>
      </div>
      {opmlPreview.length > 0 ? (
        <div className="mt-4 space-y-2 rounded-lg border border-border p-3">
          <div className="text-sm font-medium">选择要导入的订阅</div>
          <div className="max-h-64 space-y-2 overflow-auto">
            {opmlPreview.map((item) => (
              <label className="flex items-center gap-2 text-sm" key={`${item.index}:${item.url}`}>
                <input
                  type="checkbox"
                  checked={selectedOpmlIndexes.includes(item.index)}
                  disabled={item.duplicate}
                  onChange={(event) =>
                    setSelectedOpmlIndexes((current) =>
                      event.target.checked
                        ? Array.from(new Set([...current, item.index]))
                        : current.filter((index) => index !== item.index),
                    )
                  }
                />
                <span className="min-w-0 truncate">
                  {item.title || item.url}
                  {item.category ? ` · ${item.category}` : ""}
                  {item.duplicate ? " · 已订阅" : ""}
                </span>
              </label>
            ))}
          </div>
          <Button disabled={selectedOpmlIndexes.length === 0} onClick={() => void importOpml()}>
            导入选中项
          </Button>
        </div>
      ) : null}
    </SettingItemGroup>
  )
}

const ExternalRsshubSection = () => {
  const settingIpc = ipcServices?.setting as unknown as ExternalRsshubIpc | undefined
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

  const handleSave = async () => {
    if (!settingIpc?.setRsshubCustomUrl) {
      toast.error("当前环境不支持配置 RSSHub")
      return
    }
    await settingIpc.setRsshubCustomUrl(customUrl)
    toast.success("外部 RSSHub 已更新")
    await queryClient.invalidateQueries({ queryKey: ["rsshub", "external", "custom-url"] })
  }

  return (
    <SettingItemGroup>
      <div className="mb-2 mt-4 text-sm font-medium">外部 RSSHub</div>
      <SettingDescription>配置自建 RSSHub 实例地址。</SettingDescription>
      <div className="mt-3 flex items-center gap-2">
        <Input
          type="url"
          placeholder="https://rsshub.example.com"
          value={customUrl}
          onChange={(event) => setCustomUrl(event.target.value)}
        />
        <Button variant="outline" onClick={() => void handleSave()}>
          保存
        </Button>
      </div>
    </SettingItemGroup>
  )
}

/**
 * @description clean web app service worker cache
 */
const CleanCacheStorage = () => {
  const { t } = useTranslation("settings")

  return (
    <SettingItemGroup>
      <SettingActionItem
        label={
          <span className="flex items-center gap-1">{t("data_control.clean_cache.button")}</span>
        }
        action={async () => {
          const keys = await caches.keys()
          return Promise.all(
            keys.map((key) => {
              if (key.startsWith("workbox-precache-")) return null
              return caches.delete(key)
            }),
          ).then(() => {
            toast.success(t("data_control.clean_cache.success"))
          })
        }}
        buttonText={t("data_control.clean_cache.button")}
      />
      <SettingDescription>{t("data_control.clean_cache.description_web")}</SettingDescription>
    </SettingItemGroup>
  )
}

const CleanElectronCache = () => {
  const { t } = useTranslation("settings")

  return (
    <SettingItemGroup>
      <SettingActionItem
        label={
          <span className="flex items-center gap-1">
            {t("data_control.clean_cache.button")}
            <MotionButtonBase
              onClick={() => {
                ipcServices?.app.openCacheFolder?.()
              }}
              className="center flex"
            >
              <i className="i-mgc-folder-open-cute-re" />
            </MotionButtonBase>
          </span>
        }
        action={async () => {
          await ipcServices?.app.clearCache?.()
          queryClient.setQueryData(["app", "cache", "size"], 0)
        }}
        buttonText={t("data_control.clean_cache.button")}
      />
      <SettingDescription>{t("data_control.clean_cache.description")}</SettingDescription>
    </SettingItemGroup>
  )
}
const AppCacheLimit = () => {
  const { t } = useTranslation("settings")
  const { data: cacheSize, isLoading: isLoadingCacheSize } = useQuery({
    queryKey: ["app", "cache", "size"],
    queryFn: async () => {
      const byteSize = (await ipcServices?.app.getCacheSize?.()) ?? 0
      return Math.round(byteSize / 1024 / 1024)
    },
    refetchOnMount: "always",
  })
  const {
    data: cacheLimit,
    isLoading: isLoadingCacheLimit,
    refetch: refetchCacheLimit,
  } = useQuery({
    queryKey: ["app", "cache", "limit"],
    queryFn: async () => {
      const size = (await ipcServices?.app.getCacheLimit?.()) ?? 0
      return size
    },
  })

  const onChange = (value: number[]) => {
    ipcServices?.app.limitCacheSize?.(value[0]!)
    refetchCacheLimit()
  }

  if (isLoadingCacheSize || isLoadingCacheLimit) return null

  const InfinitySymbol = <CarbonInfinitySymbol />
  return (
    <SettingItemGroup>
      <div className={"mb-3 mt-4 flex items-center justify-between gap-4"}>
        <Label className="center flex">
          {t("data_control.app_cache_limit.label")}

          <span className="center ml-2 flex shrink-0 gap-1 text-xs opacity-60">
            <span>({cacheSize}M</span> /{" "}
            <span className="center flex shrink-0">
              {cacheLimit ? `${cacheLimit}M` : InfinitySymbol})
            </span>
          </span>
        </Label>

        <div className="relative flex w-1/5 flex-col gap-1">
          <Slider
            min={0}
            max={500}
            step={100}
            defaultValue={[cacheLimit ?? 0]}
            onValueCommit={onChange}
          />
          <div className="absolute bottom-[-1.5em] text-base opacity-50">{InfinitySymbol}</div>
          <div className="absolute bottom-[-1.5em] right-0 text-xs opacity-50">500M</div>
        </div>
      </div>
      <SettingDescription>{t("data_control.app_cache_limit.description")}</SettingDescription>
    </SettingItemGroup>
  )
}
