import { Logo } from "@follow/components/icons/logo.jsx"
import { IN_ELECTRON, MODE, ModeEnum } from "@follow/shared/constants"
import { getCurrentEnvironment } from "@follow/utils/environment"
import PKG, { repository } from "@pkg"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PlainWithAnimationModal } from "~/components/ui/modal/stacked/custom-modal"
import { useModalStack } from "~/components/ui/modal/stacked/hooks"
import { ipcServices } from "~/lib/client"
import { EnvironmentDebugModalContent } from "~/modules/app/EnvironmentIndicator"

export const SettingAbout = () => {
  const { t } = useTranslation("settings")
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const { present } = useModalStack()
  const currentEnvironment = getCurrentEnvironment().join("\n")
  const { data: appVersion } = useQuery({
    queryKey: ["appVersion"],
    queryFn: () => ipcServices?.app.getAppVersion(),
  })

  const rendererVersion = PKG.version
  const rendererClickCountRef = useRef(0)
  const rendererClickResetTimerRef = useRef<number | null>(null)
  const lastRendererClickTimestampRef = useRef(0)

  useEffect(() => {
    return () => {
      if (rendererClickResetTimerRef.current) {
        window.clearTimeout(rendererClickResetTimerRef.current)
      }
    }
  }, [])

  const handleCheckForUpdates = async () => {
    if (isCheckingUpdate) return

    setIsCheckingUpdate(true)
    const toastId = toast.loading(t("about.checkingForUpdates"))

    try {
      const result = await ipcServices?.app.checkForUpdates()

      if (result?.error) {
        toast.error(t("about.updateCheckFailed"), { id: toastId })
      } else if (result?.hasUpdate) {
        toast.success(t("about.updateAvailable"), { id: toastId })
      } else {
        toast.info(t("about.noUpdateAvailable"), { id: toastId })
      }
    } catch {
      toast.error(t("about.updateCheckFailed"), { id: toastId })
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  const handleRendererVersionClick = () => {
    if (!rendererVersion) return

    const now = Date.now()
    if (now - lastRendererClickTimestampRef.current > 800) {
      rendererClickCountRef.current = 0
    }

    rendererClickCountRef.current += 1
    lastRendererClickTimestampRef.current = now

    if (rendererClickResetTimerRef.current) {
      window.clearTimeout(rendererClickResetTimerRef.current)
    }

    rendererClickResetTimerRef.current = window.setTimeout(() => {
      rendererClickCountRef.current = 0
      rendererClickResetTimerRef.current = null
    }, 800)

    if (rendererClickCountRef.current >= 10) {
      rendererClickCountRef.current = 0
      if (rendererClickResetTimerRef.current) {
        window.clearTimeout(rendererClickResetTimerRef.current)
        rendererClickResetTimerRef.current = null
      }

      present({
        title: "Debug Actions",
        content: EnvironmentDebugModalContent,
      })
    }
  }

  return (
    <div className="mx-auto mt-6 max-w-3xl space-y-8">
      {/* Header Section */}
      <div className="px-2 text-center">
        <div className="mb-6 flex justify-center">
          <Logo className="size-20" />
        </div>
        <h1 className="-mt-4 text-center text-3xl font-semibold">FreeFolo</h1>
        {MODE !== ModeEnum.production && (
          <span className="block -translate-y-2 text-sm font-normal text-text-tertiary">
            {MODE}
          </span>
        )}
        <p className="mt-2 text-sm text-text-secondary">
          {t("about.licenseInfo", { appName: APP_NAME, currentYear: new Date().getFullYear() })}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {appVersion && (
            <span className="inline-flex items-center rounded-full bg-fill-secondary px-3 py-1 text-xs font-medium text-text-secondary">
              <span className="mr-1.5 text-text-tertiary">App</span>
              {appVersion}
            </span>
          )}
          {rendererVersion && (
            <button
              type="button"
              onClick={handleRendererVersionClick}
              className="inline-flex items-center rounded-full bg-fill-secondary px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-fill-tertiary"
            >
              <span className="mr-1.5 text-text-tertiary">Renderer</span>
              {rendererVersion}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(
                rendererVersion
                  ? `${currentEnvironment}\n**Renderer**: ${rendererVersion}`
                  : currentEnvironment,
              )
              toast.success(t("about.environmentCopied"))
            }}
            className="inline-flex items-center rounded-full px-3 py-1 text-xs text-text-tertiary transition-colors hover:bg-fill-secondary hover:text-text-secondary"
          >
            <i className="i-mgc-copy-cute-re mr-1.5" />
            {t("about.copyEnvironment")}
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="-mx-3 space-y-1 px-2">
        {IN_ELECTRON && (
          <button
            type="button"
            onClick={handleCheckForUpdates}
            disabled={isCheckingUpdate}
            className="group flex w-full items-center justify-between rounded-lg p-3 text-left transition-all hover:bg-fill-secondary hover:shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div>
                <div className="text-sm font-medium">{t("about.checkForUpdates")}</div>
                <div className="text-xs text-text-tertiary">{t("about.updateDescription")}</div>
              </div>
            </div>
            {isCheckingUpdate ? (
              <i className="i-mgc-loading-3-cute-re animate-spin text-base" />
            ) : (
              <i className="i-mgc-arrow-right-up-cute-re text-base text-text-tertiary transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => window.open(`${repository.url}/releases`, "_blank")}
          className="group flex w-full items-center justify-between rounded-lg p-3 text-left transition-all hover:bg-fill-secondary hover:shadow-sm"
        >
          <div>
            <div className="text-sm font-medium">{t("about.changelog")}</div>
            <div className="text-xs text-text-tertiary">{t("about.changelogDescription")}</div>
          </div>
          <i className="i-mgc-external-link-cute-re text-base text-text-tertiary transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
        </button>
      </div>

    </div>
  )
}
