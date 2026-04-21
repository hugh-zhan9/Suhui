import { Spring } from "@suhui/components/constants/spring.js"
import { IN_ELECTRON } from "@suhui/shared/constants"
import { useTranslation } from "react-i18next"
import { useEffect, useRef, useState } from "react"

import { resetShowSourceContent, useShowSourceContent } from "~/atoms/source-content"
import { m } from "~/components/common/Motion"
import { useRunCommandFn } from "~/modules/command/hooks/use-command"
import { COMMAND_ID } from "~/modules/command/commands/id"

import { EntryContentLoading } from "./entry-content/EntryContentLoading"
import {
  getSourceContentStatusAfterEvent,
  isSourceContentHardFailEvent,
  SOURCE_CONTENT_LOAD_TIMEOUT_MS,
  type SourceContentStatus,
} from "./source-content-state"

const ViewTag = IN_ELECTRON ? "webview" : "iframe"

export const SourceContentView = ({
  src,
  entryId,
  allowReturnToArticle = false,
}: {
  src: string
  entryId?: string
  allowReturnToArticle?: boolean
}) => {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SourceContentStatus>("loading")
  const webviewRef = useRef<any>(null)
  const runCmdFn = useRunCommandFn()
  const openInBrowser = entryId
    ? runCmdFn(COMMAND_ID.entry.openInBrowser, [{ entryId }])
    : () => window.open(src, "_blank")

  const transitionStatus = (event: Parameters<typeof getSourceContentStatusAfterEvent>[1]) => {
    setStatus((current) => getSourceContentStatusAfterEvent(current, event))
  }

  useEffect(() => {
    const abortController = new AbortController()
    const timeout = setTimeout(() => {
      transitionStatus({ type: "timeout" })
    }, SOURCE_CONTENT_LOAD_TIMEOUT_MS)
    const webview = webviewRef.current
    transitionStatus({ type: "src-changed" })

    if (!webview) {
      return () => {
        clearTimeout(timeout)
        abortController.abort()
      }
    }

    const handleSuccess = () => transitionStatus({ type: "success" })
    const handleDidFailLoad = (event: { errorCode?: number | string; isMainFrame?: boolean }) => {
      if (!isSourceContentHardFailEvent(event)) {
        return
      }

      transitionStatus({ type: "hard-fail" })
    }

    webview.addEventListener?.("dom-ready", handleSuccess, {
      signal: abortController.signal,
    })
    webview.addEventListener?.("did-stop-loading", handleSuccess, {
      signal: abortController.signal,
    })
    webview.addEventListener?.("did-fail-load", handleDidFailLoad, {
      signal: abortController.signal,
    })

    return () => {
      clearTimeout(timeout)
      abortController.abort()
    }
  }, [src])

  const isLoading = status === "loading"
  const isReady = status === "ready"
  const isDegraded = status === "degraded"
  const isHardFail = status === "hard-fail"
  const degradedCopyKey = IN_ELECTRON
    ? "entry_actions.source_content_degraded_description"
    : "entry_actions.source_content_degraded_iframe_description"

  const stateTitle = isHardFail
    ? t("entry_actions.source_content_failed")
    : t(
        IN_ELECTRON
          ? "entry_actions.source_content_degraded"
          : "entry_actions.source_content_degraded_iframe",
      )

  const closeOriginalView = () => {
    resetShowSourceContent()
  }

  return (
    <div className="relative flex size-full flex-col">
      {isLoading && (
        <div className="center absolute inset-0 mt-16 min-w-0">
          <EntryContentLoading icon={src} />
        </div>
      )}
      {(isDegraded || isHardFail) && (
        <div className="bg-theme-background/95 absolute inset-0 z-[2] flex items-center justify-center p-6">
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            <i className="i-mgc-web-cute-re text-4xl text-text-secondary" />
            <div className="text-base font-medium text-text">{stateTitle}</div>
            <div className="text-sm text-text-secondary">{t(degradedCopyKey)}</div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
                onClick={openInBrowser}
              >
                {t("entry_actions.open_in_browser", { which: t("words.browser") })}
              </button>
              {allowReturnToArticle && (
                <button
                  type="button"
                  className="border-outline rounded-lg border px-3 py-1.5 text-sm font-medium text-text"
                  onClick={closeOriginalView}
                >
                  {t("login.back")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <m.div
        className="size-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: isReady ? 1 : 0 }}
        transition={Spring.presets.smooth}
      >
        <ViewTag
          ref={webviewRef}
          className="size-full"
          src={src}
          sandbox="allow-scripts allow-same-origin"
          onLoad={() => transitionStatus({ type: "success" })}
        />
      </m.div>
    </div>
  )
}

export const SourceContentPanel = ({ src, entryId }: { src: string | null; entryId: string }) => {
  const showSourceContent = useShowSourceContent()
  if (!showSourceContent || !src) return null
  return (
    <div data-hide-in-print className="absolute left-0 top-0 z-[1] size-full bg-theme-background">
      <SourceContentView src={src} entryId={entryId} allowReturnToArticle />
    </div>
  )
}
