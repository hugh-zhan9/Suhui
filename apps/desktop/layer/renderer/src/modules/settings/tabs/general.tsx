import { Button } from "@suhui/components/ui/button/index.js"
import { Input } from "@suhui/components/ui/input/index.js"
import { ResponsiveSelect } from "@suhui/components/ui/select/responsive.js"
import { useTypeScriptHappyCallback } from "@suhui/hooks"
import { ACTION_LANGUAGE_MAP } from "@suhui/shared"
import { IN_ELECTRON } from "@suhui/shared/constants"
import { cn } from "@suhui/utils/utils"
import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import { useAtom } from "jotai"
import { useEffect } from "react"
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
import { ipcServices } from "~/lib/client"
import { setTranslationCache } from "~/modules/entry-content/atoms"
import { formatDisplayList, formatDisplayValue } from "~/modules/settings/utils/db-config-display"

import { PaidBadge, SettingDescription, SettingSwitch } from "../control"
import { createSetting } from "../helper/builder"
import { SettingPaidLevels } from "../helper/setting-builder"
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

type DbConfigView = {
  dbType: "postgres"
  dbConn: string
  dbUser: string
  dbPasswordMasked: string
  envSource?: string
  envCandidates: string[]
}

const DataSourceSection = () => {
  const { t } = useTranslation("settings")
  const query = useQuery({
    queryKey: ["db", "config"],
    queryFn: async () => {
      const config = await ipcServices?.app.getDbConfig?.()
      return (config ?? null) as DbConfigView | null
    },
    refetchOnMount: "always",
  })

  const config = query.data
  const fallback = t("general.data_source.not_set")

  return (
    <SettingItemGroup>
      <SettingDescription>
        {t("general.data_source.db_type")}: {formatDisplayValue(config?.dbType, fallback)}
      </SettingDescription>
      <SettingDescription>
        {t("general.data_source.db_conn")}: {formatDisplayValue(config?.dbConn, fallback)}
      </SettingDescription>
      <SettingDescription>
        {t("general.data_source.db_user")}: {formatDisplayValue(config?.dbUser, fallback)}
      </SettingDescription>
      <SettingDescription>
        {t("general.data_source.db_password")}:{" "}
        {formatDisplayValue(config?.dbPasswordMasked, fallback)}
      </SettingDescription>
      <SettingDescription>
        {t("general.data_source.env_source")}: {formatDisplayValue(config?.envSource, fallback)}
      </SettingDescription>
      <SettingDescription>
        {t("general.data_source.env_candidates")}:{" "}
        {formatDisplayList(config?.envCandidates ?? [], fallback)}
      </SettingDescription>
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
          <PaidBadge paidLevel={SettingPaidLevels.Basic} />
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
