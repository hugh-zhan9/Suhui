import { ActionButton } from "@suhui/components/ui/button/action-button.js"
import type { SupportedActionLanguage } from "@suhui/shared"
import { IN_ELECTRON } from "@suhui/shared/constants"
import { useIsEntryStarred } from "@suhui/store/collection/hooks"
import { useEntry } from "@suhui/store/entry/hooks"
import { useSubscriptionByFeedId } from "@suhui/store/subscription/hooks"
import { runtimeClient } from "@suhui/store/runtime"
import { useEntryTranslation, useEntryTranslationProgress } from "@suhui/store/translation/hooks"
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
  const translatedEntry = useEntryTranslation({
    entryId,
    language: actionLanguage,
    enabled: true,
    respectEntrySetting: false,
  })
  const isTranslating =
    translationProgress?.status === "translating" || translationProgress?.status === "partial"
  const translationTooltip = !translationEnabled
    ? t("entry.translation.enable")
    : translationProgress?.status === "error"
      ? t("entry.translation.failed")
      : isTranslating && translationProgress.totalBatches > 0
        ? t("entry.translation.progress", {
            completed: translationProgress.completedBatches,
            total: translationProgress.totalBatches,
          })
        : translatedEntry
          ? t("entry.translation.complete")
          : t("entry.translation.translating")

  return (
    <div className={clsx("relative flex shrink-0 items-center justify-end gap-2")}>
      {IN_ELECTRON && (
        <ActionButton
          tooltip={translationTooltip}
          tooltipDescription={
            translationProgress?.status === "error" ? translationProgress.error : undefined
          }
          active={translationEnabled}
          icon={
            <i
              className={clsx(
                "i-mgc-translate-2-cute-re",
                isTranslating && "animate-pulse text-accent",
                translationProgress?.status === "error" && "text-red",
              )}
            />
          }
          onClick={() =>
            setCurrentTranslationOverride(entryId, translationEnabled ? "force-off" : "force-on")
          }
          id={`${entryId}/translation/quick`}
        />
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
