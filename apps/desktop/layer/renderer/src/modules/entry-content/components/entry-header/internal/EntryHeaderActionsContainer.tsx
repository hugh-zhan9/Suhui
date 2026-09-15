import { ActionButton } from "@suhui/components/ui/button/action-button.js"
import type { SupportedActionLanguage } from "@suhui/shared"
import { IN_ELECTRON } from "@suhui/shared/constants"
import { useIsEntryStarred } from "@suhui/store/collection/hooks"
import { useEntry } from "@suhui/store/entry/hooks"
import { runtimeClient } from "@suhui/store/runtime"
import { useSubscriptionByFeedId } from "@suhui/store/subscription/hooks"
import { useEntryTranslationProgress } from "@suhui/store/translation/hooks"
import clsx from "clsx"
import { memo } from "react"
import { useTranslation } from "react-i18next"

import { setCurrentTranslationOverride, useShowAITranslation } from "~/atoms/ai-translation"
import { useActionLanguage } from "~/atoms/settings/general"
import { CommandActionButton } from "~/components/ui/button/CommandActionButton"
import { isPDFExportSupportedView } from "~/hooks/biz/export-as-pdf"
import { useRouteParams } from "~/hooks/biz/useRouteParams"
import { COMMAND_ID } from "~/modules/command/commands/id"
import { useRunCommandFn } from "~/modules/command/hooks/use-command"

import { EntryHeaderActions } from "../../../actions/header-actions"
import { MoreActions } from "../../../actions/more-actions"
import { useEntryTranslationQuery } from "../../../use-entry-translation-query"
import { useEntryHeaderContext } from "./context"

function EntryHeaderActionsContainerImpl({ isSmallWidth }: { isSmallWidth?: boolean }) {
  const { entryId } = useEntryHeaderContext()
  const { view } = useRouteParams()
  const isStarred = useIsEntryStarred(entryId)
  const entry = useEntry(entryId, (state) => ({
    feedId: state.feedId,
    translation: state.settings?.translation,
  }))
  const subscription = useSubscriptionByFeedId(entry?.feedId)
  const runCmdFn = useRunCommandFn()
  const exportView = subscription?.view ?? view
  const canShowExportAsPDF = isPDFExportSupportedView(exportView)
  const { t } = useTranslation("app")
  const actionLanguage = useActionLanguage() as SupportedActionLanguage
  const translationEnabled = useShowAITranslation(entryId, !!entry?.translation)
  const translationProgress = useEntryTranslationProgress(entryId, actionLanguage)
  const translationQuery = useEntryTranslationQuery(entryId)
  const translationError = !translationQuery?.isFetching ? translationQuery?.error : null
  const isComplete =
    !translationQuery?.isFetching && !translationError && translationQuery?.isSuccess
  const isTranslating = translationEnabled && !translationError && !isComplete
  const translationTooltip = !translationEnabled
    ? t("entry.translation.enable")
    : translationError
      ? t("entry.translation.failed")
      : isTranslating &&
          translationProgress?.status === "partial" &&
          translationProgress.totalBatches > 0
        ? t("entry.translation.progress", {
            completed: translationProgress.completedBatches,
            total: translationProgress.totalBatches,
          })
        : isComplete
          ? t("entry.translation.complete")
          : t("entry.translation.translating")

  return (
    <div className={clsx("relative flex shrink-0 items-center justify-end gap-2")}>
      {IN_ELECTRON && (
        <ActionButton
          className="w-auto gap-1.5 px-2 text-sm"
          aria-pressed={translationEnabled}
          tooltip={translationTooltip}
          tooltipDescription={translationEnabled ? translationError?.message : undefined}
          active={translationEnabled}
          icon={
            <i
              className={clsx(
                isTranslating
                  ? "i-mgc-loading-3-cute-re animate-spin text-accent motion-reduce:animate-none"
                  : "i-mgc-translate-2-cute-re",
                translationEnabled && translationError && "text-red",
              )}
            />
          }
          onClick={() =>
            setCurrentTranslationOverride(entryId, translationEnabled ? "force-off" : "force-on")
          }
          id={`${entryId}/translation/quick`}
        >
          <span className="whitespace-nowrap">
            {!translationEnabled
              ? t("entry.translation.label")
              : translationError
                ? t("entry.translation.error")
                : isComplete
                  ? t("entry.translation.complete")
                  : t("entry.translation.translating")}
          </span>
        </ActionButton>
      )}
      <CommandActionButton
        commandId={COMMAND_ID.entry.star}
        active={isStarred}
        onClick={runCmdFn(COMMAND_ID.entry.star, [{ entryId, view }])}
        id={`${entryId}/${COMMAND_ID.entry.star}/quick`}
      />
      <ActionButton
        tooltip="稍后读"
        icon={<i className="i-mgc-time-cute-re" />}
        onClick={() => void runtimeClient.readingQueue.add(entryId)}
        id={`${entryId}/reading-queue/quick`}
      />
      {canShowExportAsPDF && (
        <ActionButton
          tooltip="导出 PDF"
          icon={<i className="i-mgc-pdf-cute-re" />}
          onClick={runCmdFn(COMMAND_ID.entry.exportAsPDF, [{ entryId }])}
          id={`${entryId}/${COMMAND_ID.entry.exportAsPDF}/quick`}
        />
      )}
      {!isSmallWidth && <EntryHeaderActions entryId={entryId} view={view} />}
      <MoreActions entryId={entryId} view={view} showMainAction={isSmallWidth} />
    </div>
  )
}

export const EntryHeaderActionsContainer = memo(EntryHeaderActionsContainerImpl)
