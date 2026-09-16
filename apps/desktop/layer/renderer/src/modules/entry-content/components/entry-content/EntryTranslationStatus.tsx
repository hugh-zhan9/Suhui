import type { SupportedActionLanguage } from "@suhui/shared"
import { useEntryTranslationProgress } from "@suhui/store/translation/hooks"
import { translationSyncService } from "@suhui/store/translation/store"
import type { UseQueryResult } from "@tanstack/react-query"
import clsx from "clsx"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { copyToClipboard } from "~/lib/clipboard"

export function EntryTranslationStatus({
  entryId,
  language,
  query,
}: {
  entryId: string
  language: SupportedActionLanguage
  query?: Pick<UseQueryResult, "isFetching" | "isSuccess" | "error"> &
    Partial<Pick<UseQueryResult, "refetch">>
}) {
  const { t } = useTranslation("app")
  const progress = useEntryTranslationProgress(entryId, language)
  const [copyResult, setCopyResult] = useState<{ error: Error; copied: boolean } | null>(null)
  const [completionHidden, setCompletionHidden] = useState(false)
  // The current content query owns completion. A title or a partial result in the
  // shared translation store does not mean the displayed article has finished.
  const busy = query?.isFetching || !!progress?.retryingBatchId
  const error = useMemo(
    () => (busy ? null : (query?.error ?? (progress?.error ? new Error(progress.error) : null))),
    [busy, query?.error, progress?.error],
  )
  const failures = progress?.batchState?.failedBatches ?? []
  const incomplete = !busy && failures.length > 0
  const complete = !busy && !error && query?.isSuccess && !incomplete
  const [retryError, setRetryError] = useState<string | null>(null)
  useEffect(() => {
    setCompletionHidden(false)
    if (!complete) return
    const timer = setTimeout(() => setCompletionHidden(true), 3000)
    return () => clearTimeout(timer)
  }, [complete, entryId, language])

  if (complete && completionHidden) return null

  const showProgress = busy && progress?.totalBatches !== undefined && progress.totalBatches > 0
  const label = error
    ? t("entry.translation.error")
    : incomplete
      ? t("entry.translation.incomplete", { count: failures.length })
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
        error || incomplete ? "bg-red/5" : "bg-fill-quaternary",
      )}
      data-hide-in-print
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span role="status" className="flex min-w-0 items-center gap-2">
          <i
            aria-hidden="true"
            className={clsx(
              "shrink-0",
              error || incomplete
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
      {error && query?.refetch && (
        <button
          type="button"
          className="no-drag-region mt-1 text-accent hover:underline"
          onClick={() => {
            setRetryError(null)
            void query.refetch?.()
          }}
        >
          {t("entry.translation.restart")}
        </button>
      )}
      {failures.length > 0 && (
        <details className="mt-1 text-text-secondary">
          <summary>{t("entry.translation.failed_batches", { count: failures.length })}</summary>
          {failures.map((failure) => (
            <div key={failure.id} className="my-2 select-text">
              <span>
                {t(
                  failure.target === "title"
                    ? "entry.translation.title_batch"
                    : "entry.translation.body_batch",
                  { index: failure.batchIndex },
                )}
              </span>
              <button
                type="button"
                disabled={busy}
                className="no-drag-region ml-2 text-accent disabled:opacity-60"
                onClick={() => {
                  setRetryError(null)
                  void translationSyncService
                    .retryBatch(entryId, language, failure.id)
                    .catch((error) =>
                      setRetryError(error instanceof Error ? error.message : String(error)),
                    )
                }}
              >
                {t(
                  progress?.retryingBatchId === failure.id
                    ? "entry.translation.retrying"
                    : "entry.translation.retry",
                )}
              </button>
              <button
                type="button"
                className="no-drag-region ml-2 text-accent"
                onClick={() => {
                  void copyToClipboard(failure.error).catch(() =>
                    setRetryError(t("entry.translation.copy_failed")),
                  )
                }}
              >
                {t("entry.translation.copy_error")}
              </button>
              <p className="whitespace-pre-wrap break-words">{failure.error}</p>
            </div>
          ))}
        </details>
      )}
      {retryError && (
        <p role="alert" className="select-text text-red">
          {retryError}
        </p>
      )}
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
