import type { SupportedActionLanguage } from "@suhui/shared"
import { useEntryTranslationProgress } from "@suhui/store/translation/hooks"
import type { UseQueryResult } from "@tanstack/react-query"
import clsx from "clsx"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { copyToClipboard } from "~/lib/clipboard"

export function EntryTranslationStatus({
  entryId,
  language,
  query,
}: {
  entryId: string
  language: SupportedActionLanguage
  query?: Pick<UseQueryResult, "isFetching" | "isSuccess" | "error">
}) {
  const { t } = useTranslation("app")
  const progress = useEntryTranslationProgress(entryId, language)
  const [copyResult, setCopyResult] = useState<{ error: Error; copied: boolean } | null>(null)
  const [completionHidden, setCompletionHidden] = useState(false)
  // The current content query owns completion. A title or a partial result in the
  // shared translation store does not mean the displayed article has finished.
  const error = !query?.isFetching ? query?.error : null
  const complete = !query?.isFetching && !error && query?.isSuccess
  useEffect(() => {
    setCompletionHidden(false)
    if (!complete) return
    const timer = setTimeout(() => setCompletionHidden(true), 3000)
    return () => clearTimeout(timer)
  }, [complete, entryId, language])

  if (complete && completionHidden) return null

  const showProgress =
    query?.isFetching && progress?.status === "partial" && progress.totalBatches > 0
  const label = error
    ? t("entry.translation.error")
    : complete
      ? t("entry.translation.complete")
      : showProgress
        ? t("entry.translation.progress", {
            completed: progress.completedBatches,
            total: progress.totalBatches,
          })
        : t("entry.translation.translating")

  return (
    <div
      className={clsx(
        "no-drag-region shrink-0 select-text border-b border-fill-secondary px-4 py-2 text-sm print:hidden",
        error ? "bg-red/5" : "bg-fill-quaternary",
      )}
      data-hide-in-print
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span role="status" className="flex min-w-0 items-center gap-2">
          <i
            aria-hidden="true"
            className={clsx(
              "shrink-0",
              error
                ? "i-mgc-warning-cute-re text-red"
                : complete
                  ? "i-mgc-check-cute-re text-green"
                  : "i-mgc-loading-3-cute-re animate-spin text-accent motion-reduce:animate-none",
            )}
          />
          {label}
        </span>
        {error && (
          <button
            type="button"
            className="no-drag-region shrink-0 text-accent hover:underline"
            onClick={async () => {
              try {
                await copyToClipboard(error.message)
                setCopyResult({ error, copied: true })
              } catch {
                setCopyResult({ error, copied: false })
              }
            }}
          >
            {t(
              copyResult?.error === error && copyResult.copied
                ? "entry.translation.copied"
                : "entry.translation.copy_error",
            )}
          </button>
        )}
      </div>
      {error && copyResult?.error === error && !copyResult.copied && (
        <p role="alert" className="mt-1 text-red">
          {t("entry.translation.copy_failed")}
        </p>
      )}
      {error && (
        <p className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-text-secondary">
          {error.message}
        </p>
      )}
    </div>
  )
}
