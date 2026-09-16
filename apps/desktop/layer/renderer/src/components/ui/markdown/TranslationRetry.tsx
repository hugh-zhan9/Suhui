import type { TranslationBatchState } from "@suhui/shared"
import type { ComponentProps } from "react"
import { Children, createContext, use } from "react"
import { useTranslation } from "react-i18next"

export const TranslationRetryContext = createContext<{
  state: TranslationBatchState
  busy: boolean
  retryingBatchIds?: string[]
  retry: (batchId: string) => void
} | null>(null)

export function TranslationRetrySpan(props: ComponentProps<"span"> & { marker?: string }) {
  const { marker, ...rest } = props
  const context = use(TranslationRetryContext)
  const { t } = useTranslation("app")
  if (!marker) return <span {...rest} />
  const failure = context?.state.failedBatches.find(
    (batch) => `${context.state.sessionId}:${batch.id}` === marker,
  )
  if (!failure || !context || Children.count(rest.children) > 0) return <span {...rest} />
  return (
    <span
      className="no-drag-region mx-2 inline-flex items-center gap-2 text-sm text-red print:hidden"
      data-hide-in-print
    >
      <span>{t("entry.translation.batch_failed")}</span>
      <button
        type="button"
        disabled={context.busy || context.retryingBatchIds?.includes(failure.id)}
        title={failure.error}
        className="no-drag-region text-accent hover:underline disabled:cursor-wait disabled:opacity-60"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          context.retry(failure.id)
        }}
      >
        {t(
          context.retryingBatchIds?.includes(failure.id)
            ? "entry.translation.retrying"
            : "entry.translation.retry",
        )}
      </button>
    </span>
  )
}
