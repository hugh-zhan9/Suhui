import { Button } from "@suhui/components/ui/button/index.js"
import { Input } from "@suhui/components/ui/input/index.js"
import { ResponsiveSelect } from "@suhui/components/ui/select/responsive.js"
import { useTypeScriptHappyCallback } from "@suhui/hooks"
import { ACTION_LANGUAGE_MAP } from "@suhui/shared"
import type {
  TranslationProviderConfigInput,
  TranslationProviderConfigView,
  TranslationProviderKind,
} from "@suhui/shared/translation"
import { IN_ELECTRON } from "@suhui/shared/constants"
import { translationActions } from "@suhui/store/translation/store"
import { cn } from "@suhui/utils/utils"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import { useAtom } from "jotai"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { currentSupportedLanguages } from "~/@types/constants"
import { defaultResources } from "~/@types/default-resource"
import { langLoadingLockMapAtom } from "~/atoms/lang"
import {
  DEFAULT_ACTION_LANGUAGE,
  setGeneralSetting,
  useGeneralSettingKey,
  useGeneralSettingSelector,
  useGeneralSettingValue,
} from "~/atoms/settings/general"
import { useDialog } from "~/components/ui/modal/stacked/hooks"
import { useMinimizeToTrayValue, useSetMinimizeToTray } from "~/hooks/biz/useTraySetting"
import { fallbackLanguage } from "~/i18n"
import {
  canSwitchRendererDbConfig,
  getRendererDbConfig,
  ipcServices,
  resetRendererAfterDatabaseSwitch,
  resetRendererDbConfigOverride,
  switchRendererDbConfig,
} from "~/lib/client"
import { toast } from "~/lib/toast"
import { setTranslationCache } from "~/modules/entry-content/atoms"
import { formatDisplayList, formatDisplayValue } from "~/modules/settings/utils/db-config-display"

import { SettingDescription, SettingSwitch } from "../control"
import { createSetting } from "../helper/builder"
import {
  useWrapEnhancedSettingItem,
  WrapEnhancedSettingTab,
} from "../hooks/useWrapEnhancedSettingItem"
import { SettingItemGroup } from "../section"

const { defineSettingItem: _defineSettingItem, SettingBuilder } = createSetting(
  "general",
  useGeneralSettingValue,
  setGeneralSetting,
)

const saveLoginSetting = (checked: boolean) => {
  ipcServices?.setting.setLoginItemSettings({
    openAtLogin: checked,
    openAsHidden: true,
    args: ["--startup"],
  })
  setGeneralSetting("appLaunchOnStartup", checked)
}

export const SettingGeneral = () => {
  const { t } = useTranslation("settings")
  useEffect(() => {
    ipcServices?.setting.getLoginItemSettings().then((settings) => {
      if (settings) {
        setGeneralSetting("appLaunchOnStartup", settings.openAtLogin)
      }
    })
  }, [])

  const defineSettingItem = useWrapEnhancedSettingItem(
    _defineSettingItem,
    WrapEnhancedSettingTab.General,
  )

  const { ask } = useDialog()
  const reRenderKey = useGeneralSettingKey("enhancedSettings")

  return (
    <div className="mt-4">
      <SettingBuilder
        key={reRenderKey.toString()}
        settings={[
          {
            type: "title",
            value: t("general.app"),
          },

          defineSettingItem("appLaunchOnStartup", {
            label: t("general.launch_at_login"),
            hide: !ipcServices,
            onChange(value) {
              saveLoginSetting(value)
            },
          }),
          IN_ELECTRON && MinimizeToTraySetting,
          IN_ELECTRON && PDFSavePathSetting,
          LanguageSelector,

          {
            type: "title",
            value: t("general.data_source.title"),
          },
          DataSourceSection,

          {
            type: "title",
            value: t("general.action.title"),
          },
          defineSettingItem("summary", {
            label: t("general.action.summary.label"),
            description: t("general.action.summary.description"),
          }),
          defineSettingItem("translation", {
            label: t("general.action.translation.label"),
            description: t("general.action.translation.description"),
          }),
          TranslationModeSelector,
          ActionLanguageSelector,
          IN_ELECTRON && TranslationProviderSection,

          {
            type: "title",
            value: t("general.subscription"),
          },
          defineSettingItem("autoGroup", {
            label: t("general.auto_group.label"),
            description: t("general.auto_group.description"),
          }),
          defineSettingItem("hideAllReadSubscriptions", {
            label: t("general.hide_all_read_subscriptions.label"),
            description: t("general.hide_all_read_subscriptions.description"),
          }),
          defineSettingItem("hidePrivateSubscriptionsInTimeline", {
            label: t("general.hide_private_subscriptions_in_timeline.label"),
            description: t("general.hide_private_subscriptions_in_timeline.description"),
          }),

          {
            type: "title",
            value: t("general.timeline"),
          },
          defineSettingItem("unreadOnly", {
            label: t("general.show_unread_on_launch.label"),
            description: t("general.show_unread_on_launch.description"),
          }),
          defineSettingItem("groupByDate", {
            label: t("general.group_by_date.label"),
            description: t("general.group_by_date.description"),
          }),
          defineSettingItem("autoExpandLongSocialMedia", {
            label: t("general.auto_expand_long_social_media.label"),
            description: t("general.auto_expand_long_social_media.description"),
          }),
          defineSettingItem("dimRead", {
            label: t("general.dim_read.label"),
            description: t("general.dim_read.description"),
          }),

          { type: "title", value: t("general.mark_as_read.title") },

          defineSettingItem("scrollMarkUnread", {
            label: t("general.mark_as_read.scroll.label"),
            description: t("general.mark_as_read.scroll.description"),
          }),

          defineSettingItem("hoverMarkUnread", {
            label: t("general.mark_as_read.hover.label"),
            description: t("general.mark_as_read.hover.description"),
          }),
          defineSettingItem("renderMarkUnread", {
            label: t("general.mark_as_read.render.label"),
            description: t("general.mark_as_read.render.description"),
          }),

          { type: "title", value: t("general.advanced") },

          defineSettingItem("enhancedSettings", {
            label: t("general.enhanced.label"),
            description: t("general.enhanced.description"),
            onChangeGuard(value) {
              if (value) {
                ask({
                  variant: "danger",
                  title: t("general.enhanced.enable.modal.title"),
                  message: t("general.enhanced.enable.modal.description"),
                  confirmText: t("general.enhanced.enable.modal.confirm"),
                  cancelText: t("general.enhanced.enable.modal.cancel"),
                  onConfirm: () => {
                    setGeneralSetting("enhancedSettings", value)
                  },
                })
                return "handled"
              }
            },
          }),
        ]}
      />
    </div>
  )
}

type DbConfigDraft = {
  dbConn: string
  dbUser: string
  dbPassword: string
}

const DataSourceSection = () => {
  const { t } = useTranslation("settings")
  const [draft, setDraft] = useState<DbConfigDraft>({
    dbConn: "",
    dbUser: "",
    dbPassword: "",
  })
  const [isSaving, setIsSaving] = useState(false)
  const query = useQuery({
    queryKey: ["db", "config"],
    queryFn: getRendererDbConfig,
    refetchOnMount: "always",
  })

  const config = query.data
  const fallback = t("general.data_source.not_set")
  const canSwitch = canSwitchRendererDbConfig()

  useEffect(() => {
    if (!config) return
    setDraft({
      dbConn: config.dbConn ?? "",
      dbUser: config.dbUser ?? "",
      dbPassword: "",
    })
  }, [config])

  const hasChanges =
    !!config &&
    (draft.dbConn !== config.dbConn || draft.dbUser !== config.dbUser || !!draft.dbPassword)

  const handleSave = async () => {
    if (!hasChanges || isSaving) return

    setIsSaving(true)
    try {
      await switchRendererDbConfig({
        dbConn: draft.dbConn.trim(),
        dbUser: draft.dbUser.trim(),
        ...(draft.dbPassword ? { dbPassword: draft.dbPassword } : {}),
      })
      toast.success("数据库配置已保存，正在重新加载。")
      await resetRendererAfterDatabaseSwitch()
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存数据库配置失败。"
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetOverride = async () => {
    if (isSaving) return

    setIsSaving(true)
    try {
      await resetRendererDbConfigOverride()
      toast.success("已恢复环境变量数据库配置，正在重新加载。")
      await resetRendererAfterDatabaseSwitch()
    } catch (error) {
      const message = error instanceof Error ? error.message : "恢复数据库配置失败。"
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SettingItemGroup>
      <SettingDescription>
        {t("general.data_source.db_type")}: {formatDisplayValue(config?.dbType, fallback)}
      </SettingDescription>
      <SettingDescription>
        有效配置来源: {config?.effectiveSource === "store-override" ? "应用内覆盖" : "环境变量"}
      </SettingDescription>
      <div className="mt-4 space-y-3">
        <label className="block text-sm font-medium text-text">
          {t("general.data_source.db_conn")}
          <Input
            className="mt-2"
            value={draft.dbConn}
            onChange={(event) => {
              setDraft((current) => ({ ...current, dbConn: event.target.value }))
            }}
            placeholder="127.0.0.1:5432/suhui"
          />
        </label>
        <label className="block text-sm font-medium text-text">
          {t("general.data_source.db_user")}
          <Input
            className="mt-2"
            value={draft.dbUser}
            onChange={(event) => {
              setDraft((current) => ({ ...current, dbUser: event.target.value }))
            }}
            placeholder="postgres"
          />
        </label>
        <label className="block text-sm font-medium text-text">
          {t("general.data_source.db_password")}
          <Input
            className="mt-2"
            type="password"
            value={draft.dbPassword}
            onChange={(event) => {
              setDraft((current) => ({ ...current, dbPassword: event.target.value }))
            }}
            placeholder={config?.dbPasswordMasked ? "已设置，留空则保持现有值" : fallback}
          />
        </label>
      </div>
      <SettingDescription>
        {t("general.data_source.env_source")}: {formatDisplayValue(config?.envSource, fallback)}
      </SettingDescription>
      <SettingDescription>
        {t("general.data_source.env_candidates")}:{" "}
        {formatDisplayList(config?.envCandidates ?? [], fallback)}
      </SettingDescription>
      <div className="mt-4 flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={!canSwitch || !hasChanges || isSaving || !draft.dbConn.trim()}
          onClick={() => void handleSave()}
        >
          {isSaving ? `${t("actions.save")}...` : t("actions.save")}
        </Button>
        {config?.overrideActive && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isSaving}
            onClick={() => void handleResetOverride()}
          >
            恢复环境变量配置
          </Button>
        )}
        {!canSwitch && (
          <span className="text-xs text-text-secondary">当前构建尚未接入运行时数据库切换。</span>
        )}
      </div>
    </SettingItemGroup>
  )
}

export const LanguageSelector = ({
  containerClassName,
  contentClassName,

  showDescription = true,
}: {
  containerClassName?: string
  contentClassName?: string
  showDescription?: boolean
}) => {
  const { t } = useTranslation("settings")
  const language = useGeneralSettingSelector((state) => state.language)

  const finalRenderLanguage = currentSupportedLanguages.includes(language)
    ? language
    : fallbackLanguage

  const [loadingLanguageLockMap] = useAtom(langLoadingLockMapAtom)

  return (
    <div className={cn("mb-3 mt-4 flex w-full items-center", containerClassName)}>
      <div className="flex grow flex-col gap-1">
        <span className="shrink-0 text-sm font-medium">{t("general.language.title")}</span>
        {showDescription && (
          <SettingDescription>{t("general.language.description")}</SettingDescription>
        )}
      </div>

      <ResponsiveSelect
        size="sm"
        triggerClassName="w-48"
        contentClassName={contentClassName}
        defaultValue={finalRenderLanguage}
        value={finalRenderLanguage}
        disabled={loadingLanguageLockMap[finalRenderLanguage]}
        onValueChange={(value) => {
          setGeneralSetting("language", value as string)
          dayjs.locale(value)
        }}
        renderValue={useTypeScriptHappyCallback((item) => {
          return <span>{defaultResources[item.value].lang.name}</span>
        }, [])}
        renderItem={useTypeScriptHappyCallback((item) => {
          const lang = item.value
          const percent = I18N_COMPLETENESS_MAP[lang]

          const originalLanguageName = defaultResources[lang].lang.name

          return (
            <span className="group" key={lang}>
              <span>
                {originalLanguageName}
                {typeof percent === "number" ? (percent >= 100 ? null : ` (${percent}%)`) : null}
              </span>
            </span>
          )
        }, [])}
        items={currentSupportedLanguages.map((lang) => ({
          label: `langs.${lang}`,
          value: lang,
        }))}
      />
    </div>
  )
}

const TranslationModeSelector = () => {
  const { t } = useTranslation("settings")
  const translationMode = useGeneralSettingKey("translationMode")

  return (
    <>
      <div className="mt-4 flex items-center justify-between">
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium">
          <span>{t("general.translation_mode.label")}</span>
        </span>
        <ResponsiveSelect
          size="sm"
          triggerClassName="w-48"
          defaultValue={translationMode}
          value={translationMode}
          onValueChange={(value) => {
            setGeneralSetting("translationMode", value as "bilingual" | "translation-only")
          }}
          items={[
            { label: t("general.translation_mode.bilingual"), value: "bilingual" },
            { label: t("general.translation_mode.translation-only"), value: "translation-only" },
          ]}
        />
      </div>
      <SettingDescription>{t("general.translation_mode.description")}</SettingDescription>
    </>
  )
}

const ActionLanguageSelector = () => {
  const { t } = useTranslation("settings")
  const actionLanguage = useGeneralSettingKey("actionLanguage")

  return (
    <div className="mb-3 mt-4 flex w-full gap-1">
      <div className="flex grow flex-col gap-1">
        <span className="shrink-0 text-sm font-medium">{t("general.action_language.label")}</span>
        <SettingDescription>{t("general.action_language.description")}</SettingDescription>
      </div>

      <ResponsiveSelect
        size="sm"
        triggerClassName="w-48"
        defaultValue={actionLanguage}
        value={actionLanguage}
        onValueChange={(value) => {
          setGeneralSetting("actionLanguage", value)
          setTranslationCache({})
        }}
        items={[
          { label: t("general.action_language.default"), value: DEFAULT_ACTION_LANGUAGE },
          ...Object.values(ACTION_LANGUAGE_MAP).map((item) => ({
            label: defaultResources[item.value].lang.name,
            value: item.value,
          })),
        ]}
      />
    </div>
  )
}

type TranslationProviderDraft = {
  provider: TranslationProviderKind
  deeplBaseUrl: string
  deeplApiKey: string
  aiBaseUrl: string
  aiApiKey: string
  aiModel: string
}

const translationConfigToDraft = (
  config: TranslationProviderConfigView,
): TranslationProviderDraft => ({
  provider: config.provider,
  deeplBaseUrl: config.deepl.baseUrl,
  deeplApiKey: "",
  aiBaseUrl: config.openAICompatible.baseUrl,
  aiApiKey: "",
  aiModel: config.openAICompatible.model,
})

const getTranslationIpc = () => {
  if (!ipcServices) throw new Error("翻译设置仅在桌面应用中可用")
  return ipcServices.translation
}

const TranslationProviderSection = () => {
  const { t } = useTranslation("settings")
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<TranslationProviderDraft>({
    provider: "deepl",
    deeplBaseUrl: "https://api-free.deepl.com",
    deeplApiKey: "",
    aiBaseUrl: "https://api.openai.com/v1",
    aiApiKey: "",
    aiModel: "",
  })
  const [isSaving, setIsSaving] = useState(false)
  const query = useQuery({
    queryKey: ["translation", "provider-config"],
    queryFn: () => getTranslationIpc().getConfig(),
    enabled: !!ipcServices,
    refetchOnMount: "always",
  })
  const config = query.data

  useEffect(() => {
    if (config) setDraft(translationConfigToDraft(config))
  }, [config])

  const toInput = (): TranslationProviderConfigInput => ({
    provider: draft.provider,
    deepl: {
      baseUrl: draft.deeplBaseUrl.trim(),
      ...(draft.deeplApiKey.trim() ? { apiKey: draft.deeplApiKey.trim() } : {}),
    },
    openAICompatible: {
      baseUrl: draft.aiBaseUrl.trim(),
      model: draft.aiModel.trim(),
      ...(draft.aiApiKey.trim() ? { apiKey: draft.aiApiKey.trim() } : {}),
    },
  })

  const persist = async () => {
    const next = await getTranslationIpc().setConfig(toInput())
    translationActions.clearInSession()
    setTranslationCache({})
    queryClient.removeQueries({ queryKey: ["translation"] })
    queryClient.setQueryData(["translation", "provider-config"], next)
    setDraft(translationConfigToDraft(next))
    return next
  }

  const handleSave = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      await persist()
      toast.success(t("general.translation_provider.saved"))
    } catch (error) {
      toast.error(t("general.translation_provider.save_failed"), {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleTest = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      await persist()
      const result = await getTranslationIpc().testConfig()
      toast.success(t("general.translation_provider.test_succeeded"), {
        description: result.translatedText,
      })
    } catch (error) {
      toast.error(t("general.translation_provider.test_failed"), {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const activeBaseUrl = draft.provider === "deepl" ? draft.deeplBaseUrl : draft.aiBaseUrl
  const activeModelValid = draft.provider === "deepl" || !!draft.aiModel.trim()
  const canSubmit = !!activeBaseUrl.trim() && activeModelValid && !isSaving
  const hasActiveKey =
    draft.provider === "deepl" ? config?.deepl.hasApiKey : config?.openAICompatible.hasApiKey

  return (
    <SettingItemGroup>
      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <label className="text-sm font-medium text-text">
            {t("general.translation_provider.label")}
          </label>
          <ResponsiveSelect
            size="sm"
            triggerClassName="w-48"
            value={draft.provider}
            onValueChange={(provider) =>
              setDraft((current) => ({
                ...current,
                provider: provider as TranslationProviderKind,
              }))
            }
            items={[
              { label: t("general.translation_provider.deepl"), value: "deepl" },
              {
                label: t("general.translation_provider.openai_compatible"),
                value: "openai-compatible",
              },
            ]}
          />
        </div>
        {draft.provider === "deepl" ? (
          <>
            <label className="block text-sm font-medium text-text">
              {t("general.translation_provider.base_url")}
              <Input
                className="mt-2"
                value={draft.deeplBaseUrl}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, deeplBaseUrl: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm font-medium text-text">
              {t("general.translation_provider.api_key")}
              <Input
                className="mt-2"
                type="password"
                value={draft.deeplApiKey}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, deeplApiKey: event.target.value }))
                }
                placeholder={
                  config?.deepl.hasApiKey
                    ? t("general.translation_provider.key_saved")
                    : t("general.translation_provider.key_required")
                }
              />
            </label>
          </>
        ) : (
          <>
            <label className="block text-sm font-medium text-text">
              {t("general.translation_provider.base_url")}
              <Input
                className="mt-2"
                value={draft.aiBaseUrl}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, aiBaseUrl: event.target.value }))
                }
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label className="block text-sm font-medium text-text">
              {t("general.translation_provider.api_key")}
              <Input
                className="mt-2"
                type="password"
                value={draft.aiApiKey}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, aiApiKey: event.target.value }))
                }
                placeholder={
                  config?.openAICompatible.hasApiKey
                    ? t("general.translation_provider.key_saved")
                    : t("general.translation_provider.key_required")
                }
              />
            </label>
            <label className="block text-sm font-medium text-text">
              {t("general.translation_provider.model")}
              <Input
                className="mt-2"
                value={draft.aiModel}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, aiModel: event.target.value }))
                }
                placeholder="gpt-4.1-mini"
              />
            </label>
          </>
        )}
      </div>
      <SettingDescription className="mt-3 w-full">
        {t("general.translation_provider.description")}
      </SettingDescription>
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={!canSubmit} onClick={() => void handleSave()}>
          {isSaving ? `${t("actions.save")}...` : t("actions.save")}
        </Button>
        <Button size="sm" variant="ghost" disabled={!canSubmit} onClick={() => void handleTest()}>
          {t("general.translation_provider.save_and_test")}
        </Button>
        {hasActiveKey && (
          <span className="text-xs text-text-secondary">
            {t("general.translation_provider.configured")}
          </span>
        )}
      </div>
    </SettingItemGroup>
  )
}

const MinimizeToTraySetting = () => {
  const { t } = useTranslation("settings")
  const minimizeToTray = useMinimizeToTrayValue()
  const setMinimizeToTray = useSetMinimizeToTray()
  return (
    <SettingItemGroup>
      <SettingSwitch
        checked={minimizeToTray}
        className="mt-4"
        onCheckedChange={setMinimizeToTray}
        label={t("general.minimize_to_tray.label")}
      />
      <SettingDescription>{t("general.minimize_to_tray.description")}</SettingDescription>
    </SettingItemGroup>
  )
}

const PDFSavePathSetting = () => {
  const { t } = useTranslation("settings")
  const pdfSavePath = useGeneralSettingKey("pdfSavePath")

  const handleChoose = async () => {
    const dir = await ipcServices?.app.showFolderDialog()
    if (dir) {
      setGeneralSetting("pdfSavePath", dir)
    }
  }

  const handleClear = () => {
    setGeneralSetting("pdfSavePath", "")
  }

  return (
    <SettingItemGroup>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex shrink-0 flex-col gap-1">
          <span className="text-sm font-medium">{t("general.pdf_save_path.label")}</span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            value={pdfSavePath}
            readOnly
            placeholder={t("general.pdf_save_path.placeholder")}
            className="min-w-0 flex-1 cursor-default truncate text-xs"
          />
          <Button size="sm" variant="outline" onClick={handleChoose}>
            {t("general.pdf_save_path.choose")}
          </Button>
          {pdfSavePath && (
            <Button size="sm" variant="ghost" onClick={handleClear}>
              {t("general.pdf_save_path.clear")}
            </Button>
          )}
        </div>
      </div>
      <SettingDescription>{t("general.pdf_save_path.description")}</SettingDescription>
    </SettingItemGroup>
  )
}
